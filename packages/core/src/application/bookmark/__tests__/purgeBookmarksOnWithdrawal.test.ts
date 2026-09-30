import { Account } from "@repo/core/domain/account/entity";
import { AccountEvents } from "@repo/core/domain/account/events";
import { EventId } from "@repo/core/domain/common/event";
import type { AccountId } from "@repo/core/domain/common/ids";
import { describe, expect, it } from "vitest";
import { withdraw } from "../../account/withdraw";
import { purgeBookmarksOnWithdrawal } from "../purgeBookmarksOnWithdrawal";
import { type BookmarkKit, bookmarkKit, listingRef, placeRef } from "./kit";

type Person = Awaited<ReturnType<BookmarkKit["person"]>>;

function withdrawnEvent(k: BookmarkKit, accountId: AccountId) {
  return {
    ...AccountEvents.withdrawn(accountId, k.clock.now()),
    id: EventId.create(k.idGenerator.next()),
  };
}

const withdrawn = async (k: BookmarkKit, who: Person) => {
  await withdraw({ container: k.container, actor: who.actor, input: {} });
  return withdrawnEvent(k, who.actor.accountId);
};

const purge = (k: BookmarkKit, e: ReturnType<typeof withdrawnEvent>) =>
  purgeBookmarksOnWithdrawal.handle(k.container, e);

/** The account's bookmarks, read past the signed-in check. */
const stored = (k: BookmarkKit, accountId: AccountId) =>
  k.container.unitOfWorkProvider.run(({ bookmarkRepository }) =>
    bookmarkRepository.findByAccount(accountId, { page: 1, limit: 100 }),
  );

describe("purgeBookmarksOnWithdrawal", () => {
  it("purgeBookmarksOnWithdrawal#1 利用者 A が掲載と店舗を保存済み。A が退会した / A の account.withdrawn を消費する", async () => {
    const k = await bookmarkKit();
    const A = await k.person();
    const place = await k.w.place();
    await k.save(A.actor, listingRef(await k.w.available(place.id)));
    await k.save(A.actor, placeRef(place));
    const e = await withdrawn(k, A);
    expect((await stored(k, A.actor.accountId)).count).toBe(2);
    const events = await k.eventCount();
    await expect(purge(k, e)).resolves.toBeUndefined();
    expect(await stored(k, A.actor.accountId)).toEqual({
      items: [],
      count: 0,
    });
    expect(await k.eventCount()).toBe(events);
  });

  it("purgeBookmarksOnWithdrawal#2 上の消費の後 / 同じ account.withdrawn をもう一度消費する", async () => {
    const k = await bookmarkKit();
    const A = await k.person();
    await k.save(A.actor, k.nowhereListing());
    const e = await withdrawn(k, A);
    await purge(k, e);
    await expect(purge(k, e)).resolves.toBeUndefined();
    expect((await stored(k, A.actor.accountId)).count).toBe(0);
  });

  it("purgeBookmarksOnWithdrawal#3 保存を1件も持たない利用者が退会した / その account.withdrawn を消費する", async () => {
    const k = await bookmarkKit();
    const [A, B] = [await k.person(), await k.person()];
    const L = k.nowhereListing();
    await k.save(B.actor, L);
    const e = await withdrawn(k, A);
    await expect(purge(k, e)).resolves.toBeUndefined();
    expect(await k.listed(B.actor)).toEqual([L]);
  });

  it("purgeBookmarksOnWithdrawal#4 利用者 A と利用者 B が同じ掲載を保存済み。A が退会した / A の account.withdrawn を消費する", async () => {
    const k = await bookmarkKit();
    const [A, B] = [await k.person(), await k.person()];
    const L = listingRef(await k.w.available((await k.w.place()).id));
    await k.save(A.actor, L);
    await k.save(B.actor, L);
    await purge(k, await withdrawn(k, A));
    expect((await stored(k, A.actor.accountId)).count).toBe(0);
    expect(await k.listed(B.actor)).toEqual([L]);
  });

  it("purgeBookmarksOnWithdrawal#5 A の退会と保存の削除の後、同じメールアドレスで新しいアカウントが作られた / 新しいアカウントで listBookmarks を読む", async () => {
    const k = await bookmarkKit();
    const A = await k.person();
    await k.save(A.actor, k.nowhereListing());
    await purge(k, await withdrawn(k, A));
    const again = Account.register({
      id: k.idGenerator.next(),
      email: A.email,
    });
    await k.container.unitOfWorkProvider.run(({ accountRepository }) =>
      accountRepository.insert(again),
    );
    expect(await k.list({ accountId: again.id })).toEqual({
      items: [],
      count: 0,
    });
  });

  it("is registered for account.withdrawn", async () => {
    const { consumers, deferredConsumers } = await import(
      "../../events/consumers"
    );
    expect(consumers.purgeBookmarksOnWithdrawal.events).toEqual([
      "account.withdrawn",
    ]);
    expect(Object.keys(deferredConsumers)).not.toContain(
      "purgeBookmarksOnWithdrawal",
    );
  });
});
