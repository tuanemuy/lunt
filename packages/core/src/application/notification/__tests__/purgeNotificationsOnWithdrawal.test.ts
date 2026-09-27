import { Account } from "@repo/core/domain/account/entity";
import { AccountEvents } from "@repo/core/domain/account/events";
import { AuthorityEvents } from "@repo/core/domain/authority/events";
import { EventId } from "@repo/core/domain/common/event";
import { describe, expect, it } from "vitest";
import { listNotifications } from "../listNotifications";
import { purgeNotificationsOnWithdrawal } from "../purgeNotificationsOnWithdrawal";
import { type Kit, notificationKit, type Person } from "./kit";

function withdrawnEvent(k: Kit, who: Person) {
  return {
    ...AccountEvents.withdrawn(who.accountId, k.tick()),
    id: EventId.create(k.t.idGenerator.next()),
  };
}

/** Three revocations for `who` (three notifications). */
async function threeNotifications(k: Kit, who: Person): Promise<void> {
  for (const name of ["店舗1", "店舗2", "店舗3"]) {
    await k.consume(
      k.event(
        AuthorityEvents.stewardRemoved(
          k.place(name),
          who.accountId,
          "revoked",
          k.tick(),
        ),
      ),
    );
  }
}

const purge = (k: Kit, e: ReturnType<typeof withdrawnEvent>) =>
  purgeNotificationsOnWithdrawal.handle(k.container, e);

describe("purgeNotificationsOnWithdrawal", () => {
  it("purgeNotificationsOnWithdrawal#1 利用者 A に通知が3件ある。A が退会した / A の account.withdrawn を消費する", async () => {
    const k = notificationKit();
    const A = await k.person("a");
    await threeNotifications(k, A);
    expect(await k.notificationsOf(A)).toHaveLength(3);
    await k.withdraw(A);
    const events = await k.storedEventCount();
    const mails = k.mailer.sent.length;
    await purge(k, withdrawnEvent(k, A));
    expect(await k.notificationsOf(A)).toEqual([]);
    expect(await k.storedEventCount()).toBe(events);
    expect(k.mailer.sent).toHaveLength(mails);
  });

  it("purgeNotificationsOnWithdrawal#2 上の消費の後 / 同じ account.withdrawn をもう一度消費する", async () => {
    const k = notificationKit();
    const A = await k.person("a");
    await threeNotifications(k, A);
    await k.withdraw(A);
    const e = withdrawnEvent(k, A);
    await purge(k, e);
    await expect(purge(k, e)).resolves.toBeUndefined();
    expect(await k.notificationsOf(A)).toEqual([]);
  });

  it("purgeNotificationsOnWithdrawal#3 通知を1件も持たない利用者が退会した / その account.withdrawn を消費する", async () => {
    const k = notificationKit();
    const [A, B] = [await k.person("a"), await k.person("b")];
    await threeNotifications(k, B);
    await k.withdraw(A);
    await expect(purge(k, withdrawnEvent(k, A))).resolves.toBeUndefined();
    expect(await k.notificationsOf(B)).toHaveLength(3);
  });

  it("purgeNotificationsOnWithdrawal#4 店舗管理者 A と店舗管理者 B が、同じ出来事の通知を1つずつ持つ。A が退会した / A の account.withdrawn を消費する", async () => {
    const k = notificationKit();
    const [A, B, S3] = [
      await k.person("a"),
      await k.person("b"),
      await k.person("s3"),
    ];
    const P = k.place("店舗P");
    await k.appoint(P, A, B, S3);
    await k.consume(
      k.event(
        AuthorityEvents.stewardAppointed(
          P,
          S3.accountId,
          "application",
          k.tick(),
        ),
      ),
    );
    const [a] = await k.notificationsOf(A);
    const kept = await k.notificationsOf(B);
    expect(kept[0]?.occurrenceKey).toBe(a?.occurrenceKey);
    await k.withdraw(A);
    await purge(k, withdrawnEvent(k, A));
    expect(await k.notificationsOf(A)).toEqual([]);
    expect(await k.notificationsOf(B)).toEqual(kept);
  });

  // S2: place.suspended. The same mechanism (a withdrawn steward drops out
  // of a later delivery) is covered below with a stage-1 event.
  it.todo(
    "purgeNotificationsOnWithdrawal#5 A の退会と通知の削除の後、A が店舗管理者だった店舗 P についての place.suspended が配送された / deliverNotifications で消費する",
  );

  it("purgeNotificationsOnWithdrawal#6 A の退会と通知の削除の後、同じメールアドレスで新しいアカウントが作られた / 新しいアカウントで listNotifications を読む", async () => {
    const k = notificationKit();
    const A = await k.person("a");
    await threeNotifications(k, A);
    await k.withdraw(A);
    await purge(k, withdrawnEvent(k, A));
    const again = Account.register({
      id: k.t.idGenerator.next(),
      email: A.email,
    });
    await k.container.unitOfWorkProvider.run(({ accountRepository }) =>
      accountRepository.insert(again),
    );
    expect(
      await listNotifications({
        container: k.container,
        actor: { accountId: again.id },
        input: { pagination: { page: 1, limit: 20 } },
      }),
    ).toEqual({ items: [], count: 0 });
  });

  it("a later delivery to the withdrawn steward's place reaches the remaining stewards only", async () => {
    const k = notificationKit();
    const [A, B, S3] = [
      await k.person("a"),
      await k.person("b"),
      await k.person("s3"),
    ];
    const P = k.place("店舗P");
    await k.appoint(P, A, B, S3);
    await k.withdraw(A);
    await purge(k, withdrawnEvent(k, A));
    await k.consume(
      k.event(
        AuthorityEvents.stewardAppointed(
          P,
          S3.accountId,
          "application",
          k.tick(),
        ),
      ),
    );
    expect(await k.notificationsOf(A)).toEqual([]);
    expect(k.mailsTo(A)).toEqual([]);
    expect(await k.notificationsOf(B)).toHaveLength(1);
    expect(k.mailsTo(B)).toHaveLength(1);
  });
});
