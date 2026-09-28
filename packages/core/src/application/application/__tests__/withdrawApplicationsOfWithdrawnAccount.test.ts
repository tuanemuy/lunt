import { AccountEvents } from "@repo/core/domain/account/events";
import { EventId } from "@repo/core/domain/common/event";
import { describe, expect, it } from "vitest";
import type { Person } from "../../authority/__tests__/kit";
import type { RequestContainer } from "../../di/types";
import { ConflictError } from "../../errors";
import { withdrawApplicationsOfWithdrawnAccount } from "../withdrawApplicationsOfWithdrawnAccount";
import { type AppKit, applicationKit, commitAfterRun } from "./kit";

function withdrawnEvent(k: AppKit, who: Person) {
  return {
    ...AccountEvents.withdrawn(who.accountId, k.tick()),
    id: EventId.create(k.t.idGenerator.next()),
  };
}

const consume = (
  container: RequestContainer,
  event: ReturnType<typeof withdrawnEvent>,
) => withdrawApplicationsOfWithdrawnAccount.handle(container, event);

/** A container counting its units of work. */
function counting(container: RequestContainer) {
  const counter = { runs: 0 };
  const wrapped: RequestContainer = {
    ...container,
    unitOfWorkProvider: {
      run: (fn) => {
        counter.runs += 1;
        return container.unitOfWorkProvider.run(fn);
      },
    },
  };
  return { counter, container: wrapped };
}

describe("withdrawApplicationsOfWithdrawnAccount", () => {
  it("withdrawApplicationsOfWithdrawnAccount#1 利用者 A が個人として行った、情報修正の申請 a1（確認中）、管理権限の申請 a2（差し戻し）、掲載の申請 a3（否認）がある。A が退会した / A の account.withdrawn を消費する", async () => {
    const k = await applicationKit();
    const A = await k.person("a");
    const p1 = await k.place();
    const ph1 = await k.photo(A);
    const a1 = await k.revise(A, p1, { profile: { photoIds: [ph1] } });
    const a2 = await k.claim(A, { placeId: p1 });
    await k.sendBack(a2.id);
    const a3 = await k.newListing(A, p1);
    const rejected = await k.reject(a3.id);
    await k.deleteAccount(A);
    const mark = await k.mark();
    await consume(k.container, withdrawnEvent(k, A));
    expect((await k.app(a1.id)).status.kind).toBe("withdrawn");
    expect((await k.app(a2.id)).status.kind).toBe("withdrawn");
    expect(await k.app(a3.id)).toEqual(rejected);
    const events = await k.eventsSince(mark);
    expect(events).toEqual([
      expect.objectContaining({
        type: "application.withdrawn",
        payload: { applicationId: a1.id, approver: { kind: "operator" } },
      }),
      expect.objectContaining({
        type: "application.withdrawn",
        payload: { applicationId: a2.id, approver: { kind: "operator" } },
      }),
    ]);
    expect(await k.photoOwner(ph1)).toEqual(k.applicationOwner(a1.id));
  });

  it.todo(
    "withdrawApplicationsOfWithdrawnAccount#2 A は店舗 p1 の店舗管理者で、店舗管理者として行った所属の申請 b1 が確認中。p1 には別の店舗管理者 S がいる。A が退会した / A の account.withdrawn を消費する",
  ); // S3B: the affiliation kind (a steward's application)

  it("withdrawApplicationsOfWithdrawnAccount#3 A の登録申請 r1 と、併せた管理権限の申請 s1 が、どちらも確認中。A が退会した / A の account.withdrawn を消費する", async () => {
    const k = await applicationKit();
    const A = await k.person("a");
    const { registration: r1, stewardship: s1 } = await k.register(A, {
      claim: {},
    });
    if (s1 === null) throw new Error("no companion");
    await k.deleteAccount(A);
    const mark = await k.mark();
    const { counter, container } = counting(k.container);
    await consume(container, withdrawnEvent(k, A));
    // One read, then one unit of work for the registration and its claim.
    expect(counter.runs).toBe(2);
    expect((await k.app(r1.id)).status.kind).toBe("withdrawn");
    expect((await k.app(s1.id)).status.kind).toBe("withdrawn");
    const withdrawn = await k.eventsSince(mark, "application.withdrawn");
    expect(withdrawn.map((e) => e.aggregateId).sort()).toEqual(
      [r1.id, s1.id].sort(),
    );
  });

  it("withdrawApplicationsOfWithdrawnAccount#4 A の登録申請 r1 は承認されている。r1 に併せた管理権限の申請 s1 が確認中。A が退会した / A の account.withdrawn を消費する", async () => {
    const k = await applicationKit();
    const A = await k.person("a");
    const { registration: r1, stewardship: s1 } = await k.register(A, {
      claim: {},
    });
    if (s1 === null) throw new Error("no companion");
    await k.registrationApproved(r1.id);
    const approved = await k.app(r1.id);
    await k.deleteAccount(A);
    await consume(k.container, withdrawnEvent(k, A));
    expect((await k.app(s1.id)).status.kind).toBe("withdrawn");
    expect(await k.app(r1.id)).toEqual(approved);
  });

  it("withdrawApplicationsOfWithdrawnAccount#5 利用者 B の個人の申請 a4 が確認中。A が退会した / A の account.withdrawn を消費する", async () => {
    const k = await applicationKit();
    const [A, B] = [await k.person("a"), await k.person("b")];
    const a4 = await k.revise(B, await k.place());
    await k.deleteAccount(A);
    await consume(k.container, withdrawnEvent(k, A));
    expect(await k.app(a4.id)).toEqual(a4);
  });

  it("withdrawApplicationsOfWithdrawnAccount#6 A の進行中の申請がない / A の account.withdrawn を消費する", async () => {
    const k = await applicationKit();
    const A = await k.person("a");
    await k.deleteAccount(A);
    const mark = await k.mark();
    const { counter, container } = counting(k.container);
    await consume(container, withdrawnEvent(k, A));
    expect(counter.runs).toBe(1);
    expect(await k.eventsSince(mark)).toEqual([]);
  });

  it("withdrawApplicationsOfWithdrawnAccount#7 a1 と a2 は、account.withdrawn の消費ですでに取り下げになっている / 同じドメインイベントをもう一度消費する", async () => {
    const k = await applicationKit();
    const A = await k.person("a");
    const p1 = await k.place();
    const a1 = await k.revise(A, p1);
    const a2 = await k.claim(A, { placeId: p1 });
    await k.deleteAccount(A);
    const event = withdrawnEvent(k, A);
    await consume(k.container, event);
    const [w1, w2] = [await k.app(a1.id), await k.app(a2.id)];
    const mark = await k.mark();
    await consume(k.container, event);
    expect(await k.app(a1.id)).toEqual(w1);
    expect(await k.app(a2.id)).toEqual(w2);
    expect(await k.eventsSince(mark)).toEqual([]);
  });

  it("withdrawApplicationsOfWithdrawnAccount#8 a1 と a2 が確認中。a1 の save が、同時の承認者の承認と競合した / A の account.withdrawn を消費する", async () => {
    const k = await applicationKit();
    const A = await k.person("a");
    const p1 = await k.place();
    const a1 = await k.revise(A, p1);
    const a2 = await k.claim(A, { placeId: p1 });
    await k.deleteAccount(A);
    const event = withdrawnEvent(k, A);
    // Run 1 reads; run 2 is a1's unit (ids ascending): the approval
    // commits after it read a1 and before it commits.
    const racing = commitAfterRun(k.container, 2, () => k.approveStatus(a1.id));
    await expect(consume(racing, event)).rejects.toBeInstanceOf(ConflictError);
    expect((await k.app(a1.id)).status.kind).toBe("approved");
    expect((await k.app(a2.id)).status.kind).toBe("withdrawn");
    const mark = await k.mark();
    await consume(k.container, event);
    expect((await k.app(a1.id)).status.kind).toBe("approved");
    expect(await k.eventsSince(mark)).toEqual([]);
  });
});
