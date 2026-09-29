import type { Application } from "@repo/core/domain/application/application";
import { ApplicationId } from "@repo/core/domain/common/ids";
import { describe, expect, it } from "vitest";
import { expectCode, type Person } from "../../authority/__tests__/kit";
import { ConflictError, ForbiddenError, NotFoundError } from "../../errors";
import { withdrawApplication } from "../withdrawApplication";
import { type AppKit, applicationKit } from "./kit";
import { type StewardSeatKit, stewardSeatKit } from "./stewardSeatKit";

/**
 * Place p1 with its stewards T and S; T's affiliation application a3 to
 * region X, filed as the place, under review.
 */
async function placeAffiliation(k: StewardSeatKit) {
  const p1 = await k.place();
  const T = await k.manager(p1, "T");
  const S = await k.manager(p1, "S");
  const X = await k.addRegion();
  const a3 = await k.affiliateAsPlace(T, { placeId: p1, regionId: X });
  return { p1, T, S, X, a3 };
}

const withdraw = (
  k: Pick<AppKit, "container">,
  who: Person,
  app: Pick<Application, "id" | "version">,
) =>
  withdrawApplication({
    container: k.container,
    actor: who.actor,
    input: { applicationId: app.id, version: app.version },
  });

describe("withdrawApplication", () => {
  it("withdrawApplication#1 利用者 A の情報修正の申請 a1 が確認中。申請が持ち主の写真は ph1 / A が、確かめたときの版を添えて a1 を取り下げる", async () => {
    const k = await applicationKit();
    const A = await k.person("a");
    const p1 = await k.place();
    const ph1 = await k.photo(A);
    const a1 = await k.revise(A, p1, { profile: { photoIds: [ph1] } });
    const place = await k.getPlace(p1);
    const mark = await k.mark();
    const withdrawn = await withdraw(k, A, a1);
    expect(withdrawn.status).toEqual({ kind: "withdrawn" });
    expect(await k.app(a1.id)).toEqual(withdrawn);
    expect(await k.getPlace(p1)).toEqual(place);
    expect(await k.eventsSince(mark)).toEqual([
      expect.objectContaining({
        type: "application.withdrawn",
        payload: { applicationId: a1.id, approver: { kind: "operator" } },
      }),
    ]);
    expect(await k.photoOwner(ph1)).toEqual(k.applicationOwner(a1.id));
  });

  it("withdrawApplication#2 A の管理権限の申請 a2 が差し戻し / A が a2 を取り下げる", async () => {
    const k = await applicationKit();
    const A = await k.person("a");
    const p1 = await k.place();
    const a2 = await k.claim(A, { placeId: p1 });
    const returned = await k.sendBack(a2.id);
    expect((await withdraw(k, A, returned)).status.kind).toBe("withdrawn");
  });

  it("withdrawApplication#3 A の登録申請 r1 と、併せた管理権限の申請 s1 が、どちらも確認中 / A が r1 を取り下げる", async () => {
    const k = await applicationKit();
    const A = await k.person("a");
    const { registration: r1, stewardship: s1 } = await k.register(A, {
      claim: {},
    });
    if (s1 === null) throw new Error("no companion");
    const mark = await k.mark();
    expect((await withdraw(k, A, r1)).status.kind).toBe("withdrawn");
    expect(await k.app(s1.id)).toEqual(s1);
    expect(
      (await k.eventsSince(mark)).map((e) => [e.type, e.aggregateId]),
    ).toEqual([["application.withdrawn", r1.id]]);
  });

  it("withdrawApplication#4 A の登録申請 r1 と、併せた管理権限の申請 s1 が、どちらも確認中 / A が s1 を取り下げる", async () => {
    const k = await applicationKit();
    const A = await k.person("a");
    const { registration: r1, stewardship: s1 } = await k.register(A, {
      claim: {},
    });
    if (s1 === null) throw new Error("no companion");
    expect((await withdraw(k, A, s1)).status.kind).toBe("withdrawn");
    expect(await k.app(r1.id)).toEqual(r1);
  });

  it("withdrawApplication#5 店舗 p1 の店舗管理者 T が店舗管理者として行った所属の申請 a3 が確認中。S は p1 の別の店舗管理者 / S が a3 を取り下げる", async () => {
    const k = await stewardSeatKit();
    const { S, X, a3 } = await placeAffiliation(k);
    const mark = await k.mark();

    const withdrawn = await withdraw(k, S, a3);

    expect(withdrawn.status).toEqual({ kind: "withdrawn" });
    expect(await k.app(a3.id)).toEqual(withdrawn);
    expect(await k.eventsSince(mark)).toEqual([
      expect.objectContaining({
        type: "application.withdrawn",
        payload: {
          applicationId: a3.id,
          approver: { kind: "steward", target: { kind: "region", id: X } },
        },
      }),
    ]);
  });

  it("withdrawApplication#6 A の申請 a1 が取り下げになっている / A が、同じ店舗の情報修正を、別の ID で申請する", async () => {
    const k = await applicationKit();
    const A = await k.person("a");
    const p1 = await k.place();
    const a1 = await k.revise(A, p1);
    await withdraw(k, A, a1);
    const next = await k.revise(A, p1);
    expect(next.status.kind).toBe("underReview");
    expect(next.id).not.toBe(a1.id);
  });

  it("withdrawApplication#7 A の申請 a1 が確認中。利用者 B は申請者でない / B が a1 を取り下げる", async () => {
    const k = await applicationKit();
    const [A, B] = [await k.person("a"), await k.person("b")];
    const p1 = await k.place();
    const a1 = await k.revise(A, p1);
    await expectCode(withdraw(k, B, a1), ForbiddenError);
    expect(await k.app(a1.id)).toEqual(a1);
  });

  it("withdrawApplication#8 店舗 p1 について店舗管理者として行った申請 a3 が確認中。T は p1 の店舗管理者を辞任している / T が、自分が提出した a3 を取り下げる", async () => {
    const k = await stewardSeatKit();
    const { p1, T, a3 } = await placeAffiliation(k);
    await k.removeSteward(k.ref(p1), T);

    await expectCode(withdraw(k, T, a3), ForbiddenError);
    expect(await k.app(a3.id)).toEqual(a3);
  });

  it("withdrawApplication#9 A の申請 a1 は、取り下げる前に承認された / A が a1 を取り下げる", async () => {
    const k = await applicationKit();
    const A = await k.person("a");
    const p1 = await k.place();
    const a1 = await k.revise(A, p1);
    const approved = await k.approveStatus(a1.id);
    await expectCode(withdraw(k, A, a1), Error, "APPLICATION_ALREADY_APPROVED");
    expect(await k.app(a1.id)).toEqual(approved);
  });

  it("withdrawApplication#10 A の申請 a1 は、取り下げる前に失効した / A が a1 を取り下げる", async () => {
    const k = await applicationKit();
    const A = await k.person("a");
    const p1 = await k.place();
    const a1 = await k.revise(A, p1);
    await k.manager(p1);
    await k.lapse(a1.id);
    await expectCode(withdraw(k, A, a1), Error, "APPLICATION_ALREADY_LAPSED");
  });

  it("withdrawApplication#11 店舗 p1 について店舗管理者として行った申請 a3 を、T が先に取り下げた / S が a3 を取り下げる", async () => {
    const k = await stewardSeatKit();
    const { S, T, a3 } = await placeAffiliation(k);
    await withdraw(k, T, a3);

    await expectCode(
      withdraw(k, S, a3),
      Error,
      "APPLICATION_ALREADY_WITHDRAWN",
    );
  });

  it("answers an application withdrawn first with the withdrawn status's code", async () => {
    const k = await applicationKit();
    const A = await k.person("a");
    const p1 = await k.place();
    const a1 = await k.revise(A, p1);
    await withdraw(k, A, a1);
    await expectCode(
      withdraw(k, A, a1),
      Error,
      "APPLICATION_ALREADY_WITHDRAWN",
    );
  });

  it("withdrawApplication#12 店舗 p1 について店舗管理者として行った申請 a3 は、S が差し戻しの状態で確かめた後に、T が再提出して確認中に戻った / S が、古い版を添えて a3 を取り下げる", async () => {
    const k = await stewardSeatKit();
    const { S, T, a3 } = await placeAffiliation(k);
    const returned = await k.sendBack(a3.id);
    await k.resubmitAs(T, a3.id, { kind: "affiliation" }, "回答します");
    const resubmitted = await k.app(a3.id);

    await expectCode(withdraw(k, S, returned), ConflictError);
    expect(await k.app(a3.id)).toEqual(resubmitted);
    expect(resubmitted.status.kind).toBe("underReview");
  });

  it("refuses a version older than the stored one", async () => {
    const k = await applicationKit();
    const A = await k.person("a");
    const p1 = await k.place();
    const a1 = await k.revise(A, p1);
    const returned = await k.sendBack(a1.id);
    await expectCode(withdraw(k, A, a1), ConflictError);
    expect(await k.app(a1.id)).toEqual(returned);
  });

  it("withdrawApplication#13 ID が a9 の申請はない / A が a9 を取り下げる", async () => {
    const k = await applicationKit();
    const A = await k.person("a");
    const p1 = await k.place();
    const a1 = await k.revise(A, p1);
    await expectCode(
      withdraw(k, A, {
        id: ApplicationId.create(k.newId()),
        version: a1.version,
      }),
      NotFoundError,
    );
  });
});
