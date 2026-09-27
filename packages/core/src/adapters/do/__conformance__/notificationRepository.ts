import { EventId } from "@repo/core/domain/common/event";
import { type AccountId, NotificationId } from "@repo/core/domain/common/ids";
import type { Pagination } from "@repo/core/domain/common/pagination";
import {
  AUDIENCES,
  notificationIds,
  sampleOccurrences,
} from "@repo/core/domain/notification/__tests__/samples";
import type { Origin } from "@repo/core/domain/notification/announcement";
import {
  type DeliveredOccurrence as Delivered,
  DeliveredOccurrence,
} from "@repo/core/domain/notification/delivery";
import { Notification } from "@repo/core/domain/notification/notification";
import { describe, expect, it } from "vitest";
import { barrier, ScopeAbort } from "./fixtures";
import type { ConformanceHarness, HarnessFactory } from "./harness";

const T0 = Date.parse("2026-09-01T00:00:00.000Z");
const at = (minutes: number): Date => new Date(T0 + minutes * 60_000);

/** Notifications for one test: key `Kn` is the n-th origin of one occurrence. */
function kit() {
  const ids = notificationIds(0x30_0000);
  const base: Delivered = {
    occurrence: { to: "grantee", granted: { kind: "role", role: "editor" } },
    delivery: "direct",
  };
  const origin = (k: number): Origin => ({
    by: "event",
    eventId: EventId.create(`conformance-event-${k}`),
  });
  const note = (
    recipient: AccountId,
    k: number,
    options: Readonly<{
      id?: NotificationId;
      createdAt?: Date;
      delivered?: Delivered;
    }> = {},
  ): Notification =>
    Notification.issue(
      {
        id: options.id ?? NotificationId.create(ids.raw()),
        origin: origin(k),
        delivered: options.delivered ?? base,
        recipient,
      },
      options.createdAt ?? at(k),
    );
  const nid = () => NotificationId.create(ids.raw());
  return { ids, note, nid, account: ids.account };
}

const ALL: Pagination = { page: 1, limit: 100 };

function deliver(
  h: ConformanceHarness,
  ...notifications: readonly Notification[]
): Promise<void> {
  return h.uow.run(({ notificationRepository }) =>
    notificationRepository.deliverAll(notifications),
  );
}

function remove(h: ConformanceHarness, recipient: AccountId): Promise<void> {
  return h.uow.run(({ notificationRepository }) =>
    notificationRepository.removeAllByRecipient(recipient),
  );
}

function find(
  h: ConformanceHarness,
  recipient: AccountId,
  pagination: Pagination = ALL,
) {
  return h.uow.run(({ notificationRepository }) =>
    notificationRepository.findByRecipient(recipient, pagination),
  );
}

const idsOf = (page: { items: readonly Notification[] }) =>
  page.items.map((n) => n.id);

/** `spec/testcases/ports/notificationRepository.md`. */
export function describeNotificationRepositoryContract(
  makeHarness: HarnessFactory,
): void {
  describe("NotificationRepository contract", () => {
    describe("deliverAll", () => {
      it("notificationRepository#1 アカウント A の通知がない / A へのキー K1 の通知（id は N1、createdAt は T1）を deliverAll する", async () => {
        const h = await makeHarness();
        const k = kit();
        const A = k.account();
        const n1 = k.note(A, 1);
        await deliver(h, n1);
        const page = await find(h, A);
        expect(page.items).toEqual([n1]);
        expect(page.count).toBe(1);
      });

      it("notificationRepository#2 A にキー K1 の通知（N1、T1）がある / A へのキー K1 の通知（id は N2、createdAt は T2）を deliverAll する", async () => {
        const h = await makeHarness();
        const k = kit();
        const A = k.account();
        const n1 = k.note(A, 1, { createdAt: at(1) });
        await deliver(h, n1);
        await expect(
          deliver(h, k.note(A, 1, { createdAt: at(2) })),
        ).resolves.toBeUndefined();
        const page = await find(h, A);
        expect(page.items).toEqual([n1]);
        expect(page.count).toBe(1);
      });

      it("notificationRepository#3 A にキー K1 の通知がある / アカウント B へのキー K1 の通知を deliverAll する", async () => {
        const h = await makeHarness();
        const k = kit();
        const [A, B] = [k.account(), k.account()];
        const a = k.note(A, 1);
        const b = k.note(B, 1);
        await deliver(h, a);
        await deliver(h, b);
        expect((await find(h, A)).items).toEqual([a]);
        expect((await find(h, B)).items).toEqual([b]);
        expect(a.occurrenceKey).toBe(b.occurrenceKey);
      });

      it("notificationRepository#4 A にキー K1 の通知がある / A へのキー K2 の通知を deliverAll する", async () => {
        const h = await makeHarness();
        const k = kit();
        const A = k.account();
        const k1 = k.note(A, 1);
        const k2 = k.note(A, 2);
        await deliver(h, k1);
        await deliver(h, k2);
        expect((await find(h, A)).items).toEqual([k2, k1]);
      });

      it("notificationRepository#5 通知がない / A・B・C へのキー K1 の通知を、1つの一覧で deliverAll する", async () => {
        const h = await makeHarness();
        const k = kit();
        const people = [k.account(), k.account(), k.account()];
        const notes = people.map((who) => k.note(who, 1));
        await deliver(h, ...notes);
        for (const [i, who] of people.entries()) {
          expect((await find(h, who)).items).toEqual([notes[i]]);
        }
      });

      it("notificationRepository#6 A にキー K1 の通知（N1、T1）がある / A へのキー K1 の通知（N2、T2）と、B へのキー K1 の通知（N3、T2）を、1つの一覧で deliverAll する", async () => {
        const h = await makeHarness();
        const k = kit();
        const [A, B] = [k.account(), k.account()];
        const n1 = k.note(A, 1, { createdAt: at(1) });
        await deliver(h, n1);
        const n3 = k.note(B, 1, { createdAt: at(2) });
        await deliver(h, k.note(A, 1, { createdAt: at(2) }), n3);
        expect((await find(h, A)).items).toEqual([n1]);
        expect((await find(h, B)).items).toEqual([n3]);
      });

      it("notificationRepository#7 A の通知がある / 空の一覧を deliverAll する", async () => {
        const h = await makeHarness();
        const k = kit();
        const A = k.account();
        const n = k.note(A, 1);
        await deliver(h, n);
        await deliver(h);
        expect(await find(h, A)).toEqual({ items: [n], count: 1 });
      });

      it("notificationRepository#8 通知がない / 同じ一覧を、2回続けて deliverAll する", async () => {
        const h = await makeHarness();
        const k = kit();
        const [A, B] = [k.account(), k.account()];
        const list = [k.note(A, 1), k.note(B, 1), k.note(A, 2)];
        await deliver(h, ...list);
        const first = [await find(h, A), await find(h, B)];
        await deliver(h, ...list);
        expect([await find(h, A), await find(h, B)]).toEqual(first);
        expect(first[0]?.count).toBe(2);
      });

      it("notificationRepository#9 指す先のない AccountId を recipient とし、指す先のない ListingId を出来事に持つ通知 / deliverAll する", async () => {
        const h = await makeHarness();
        const k = kit();
        const nobody = k.account();
        const n = k.note(nobody, 1, {
          delivered: {
            occurrence: {
              to: "contentManagers",
              content: { kind: "listing", id: k.ids.listing() },
              placeId: k.ids.place(),
              matter: { kind: "suspended" },
            },
            delivery: "direct",
          },
        });
        await expect(deliver(h, n)).resolves.toBeUndefined();
        expect((await find(h, nobody)).items).toEqual([n]);
      });

      it("notificationRepository#10 店舗管理者が不在の店舗の出来事の proxy の通知と、direct の通知 / deliverAll して findByRecipient で読む", async () => {
        const h = await makeHarness();
        const k = kit();
        const O = k.account();
        const V = k.ids.place();
        const proxied = k.note(O, 1, {
          delivered: {
            occurrence: {
              to: "contentManagers",
              content: { kind: "listing", id: k.ids.listing() },
              placeId: V,
              matter: { kind: "suspended" },
            },
            delivery: "proxy",
          },
        });
        const direct = k.note(O, 2);
        await deliver(h, proxied, direct);
        const page = await find(h, O);
        expect(page.items).toEqual([direct, proxied]);
        const read = page.items[1];
        if (read === undefined) throw new Error("missing");
        expect(DeliveredOccurrence.vacantTarget(read)).toEqual({
          kind: "place",
          id: V,
        });
      });

      it("notificationRepository#11 Occurrence の宛先の立場（applicant、approver、placeStewards、regionStewards、occasionStewards、contentManagers、editors、operators、invitee、grantee、self）ごとの通知 / それぞれ deliverAll して findByRecipient で読む", async () => {
        const h = await makeHarness();
        const k = kit();
        const { samples } = sampleOccurrences(notificationIds(0x31_0000));
        expect(new Set(samples.map((s) => s.delivered.occurrence.to))).toEqual(
          new Set(AUDIENCES),
        );
        for (const [i, { name, delivered }] of samples.entries()) {
          const A = k.account();
          const n = k.note(A, i + 1, { delivered });
          await deliver(h, n);
          expect((await find(h, A)).items, name).toEqual([n]);
        }
      });
    });

    describe("removeAllByRecipient", () => {
      it("notificationRepository#12 A が3件、B が2件の通知を持つ / A で removeAllByRecipient する", async () => {
        const h = await makeHarness();
        const k = kit();
        const [A, B] = [k.account(), k.account()];
        await deliver(h, k.note(A, 1), k.note(A, 2), k.note(A, 3));
        const b = [k.note(B, 2), k.note(B, 1)];
        await deliver(h, ...b);
        await remove(h, A);
        expect(await find(h, A)).toEqual({ items: [], count: 0 });
        expect(await find(h, B)).toEqual({ items: b, count: 2 });
      });

      it("notificationRepository#13 A の通知がない / A で removeAllByRecipient する", async () => {
        const h = await makeHarness();
        const k = kit();
        const [A, B] = [k.account(), k.account()];
        const b = k.note(B, 1);
        await deliver(h, b);
        await expect(remove(h, A)).resolves.toBeUndefined();
        expect(await find(h, A)).toEqual({ items: [], count: 0 });
        expect((await find(h, B)).items).toEqual([b]);
      });

      it("notificationRepository#14 A の通知を removeAllByRecipient で削除した / もう一度 A で removeAllByRecipient する", async () => {
        const h = await makeHarness();
        const k = kit();
        const A = k.account();
        await deliver(h, k.note(A, 1));
        await remove(h, A);
        await expect(remove(h, A)).resolves.toBeUndefined();
        expect(await find(h, A)).toEqual({ items: [], count: 0 });
      });

      it("notificationRepository#15 A と B がキー K1 の通知を1つずつ持つ / A で removeAllByRecipient する", async () => {
        const h = await makeHarness();
        const k = kit();
        const [A, B] = [k.account(), k.account()];
        const b = k.note(B, 1);
        await deliver(h, k.note(A, 1), b);
        await remove(h, A);
        expect((await find(h, A)).items).toEqual([]);
        expect((await find(h, B)).items).toEqual([b]);
      });

      it("notificationRepository#16 A のキー K1 の通知を removeAllByRecipient で削除した / A へのキー K1 の通知（N2、T2）を deliverAll する", async () => {
        const h = await makeHarness();
        const k = kit();
        const A = k.account();
        await deliver(h, k.note(A, 1, { createdAt: at(1) }));
        await remove(h, A);
        const n2 = k.note(A, 1, { createdAt: at(2) });
        await deliver(h, n2);
        expect((await find(h, A)).items).toEqual([n2]);
      });
    });

    describe("findByRecipient", () => {
      it("notificationRepository#17 A の通知が3件。createdAt は T1 < T2 < T3 / 読む", async () => {
        const h = await makeHarness();
        const k = kit();
        const A = k.account();
        const [t1, t2, t3] = [k.note(A, 1), k.note(A, 2), k.note(A, 3)];
        await deliver(h, t2, t1, t3);
        expect((await find(h, A)).items).toEqual([t3, t2, t1]);
      });

      it("notificationRepository#18 A の通知に、createdAt が同じ通知が2件 / 読む", async () => {
        const h = await makeHarness();
        const k = kit();
        const A = k.account();
        const first = k.nid();
        const second = k.nid();
        const later = k.note(A, 1, { id: second, createdAt: at(5) });
        const earlier = k.note(A, 2, { id: first, createdAt: at(5) });
        await deliver(h, later, earlier);
        expect(idsOf(await find(h, A))).toEqual([first, second]);
      });

      it("notificationRepository#19 A と B が通知を持つ / A で読む", async () => {
        const h = await makeHarness();
        const k = kit();
        const [A, B] = [k.account(), k.account()];
        const a = [k.note(A, 2), k.note(A, 1)];
        await deliver(h, ...a, k.note(B, 1), k.note(B, 3), k.note(B, 4));
        expect(await find(h, A)).toEqual({ items: a, count: 2 });
      });

      it("notificationRepository#20 A の通知に、direct と proxy、出来事の種類の違う通知、指す先のない対象の通知がある / 読む", async () => {
        const h = await makeHarness();
        const k = kit();
        const A = k.account();
        const { samples } = sampleOccurrences(notificationIds(0x32_0000));
        const notes = samples.map(({ delivered }, i) =>
          k.note(A, i + 1, { delivered }),
        );
        expect(notes.some((n) => n.delivery === "proxy")).toBe(true);
        await deliver(h, ...notes);
        const page = await find(h, A);
        expect(page.count).toBe(notes.length);
        expect(page.items).toEqual([...notes].reverse());
      });

      it("notificationRepository#21 A の通知が0件 / page: 1, limit: 10 で読む", async () => {
        const h = await makeHarness();
        const A = kit().account();
        expect(await find(h, A, { page: 1, limit: 10 })).toEqual({
          items: [],
          count: 0,
        });
      });

      it("notificationRepository#22 A の通知が1件 / page: 1, limit: 10 で読む", async () => {
        const h = await makeHarness();
        const k = kit();
        const A = k.account();
        const n = k.note(A, 1);
        await deliver(h, n);
        expect(await find(h, A, { page: 1, limit: 10 })).toEqual({
          items: [n],
          count: 1,
        });
      });

      const tenOf = (k: ReturnType<typeof kit>, A: AccountId, count: number) =>
        Array.from({ length: count }, (_, i) => k.note(A, i + 1));

      it("notificationRepository#23 A の通知が10件 / page: 1, limit: 10 で読む", async () => {
        const h = await makeHarness();
        const k = kit();
        const A = k.account();
        const notes = tenOf(k, A, 10);
        await deliver(h, ...notes);
        const page = await find(h, A, { page: 1, limit: 10 });
        expect(page.items).toEqual([...notes].reverse());
        expect(page.count).toBe(10);
      });

      it("notificationRepository#24 A の通知が10件 / page: 2, limit: 10 で読む", async () => {
        const h = await makeHarness();
        const k = kit();
        const A = k.account();
        await deliver(h, ...tenOf(k, A, 10));
        expect(await find(h, A, { page: 2, limit: 10 })).toEqual({
          items: [],
          count: 10,
        });
      });

      it("notificationRepository#25 A の通知が11件 / page: 1, limit: 10 と page: 2, limit: 10 で読む", async () => {
        const h = await makeHarness();
        const k = kit();
        const A = k.account();
        const notes = tenOf(k, A, 11);
        await deliver(h, ...notes);
        const newest = [...notes].reverse();
        const first = await find(h, A, { page: 1, limit: 10 });
        const second = await find(h, A, { page: 2, limit: 10 });
        expect(first.items).toEqual(newest.slice(0, 10));
        expect(second.items).toEqual(newest.slice(10));
        expect([first.count, second.count]).toEqual([11, 11]);
      });
    });

    describe("並行性", () => {
      it("notificationRepository#26 A の通知がない / A へのキー K1 の通知の deliverAll（N1 と N2）を、2つの UnitOfWork で同時に実行する", async () => {
        const h = await makeHarness();
        const k = kit();
        const A = k.account();
        const n1 = k.note(A, 1);
        const n2 = k.note(A, 1);
        const bothRead = barrier(2);
        const attempt = (n: Notification) =>
          h.uow.run(async ({ notificationRepository }) => {
            await notificationRepository.findByRecipient(A, ALL);
            await bothRead();
            await notificationRepository.deliverAll([n]);
          });
        const results = await Promise.allSettled([attempt(n1), attempt(n2)]);
        expect(results.map((r) => r.status)).toEqual([
          "fulfilled",
          "fulfilled",
        ]);
        const page = await find(h, A);
        expect(page.count).toBe(1);
        expect([n1.id, n2.id]).toContain(page.items[0]?.id);
      });

      it("notificationRepository#27 通知がない / A・B へのキー K1 の通知の一覧と、B・C へのキー K1 の通知の一覧の deliverAll を、2つの UnitOfWork で同時に実行する", async () => {
        const h = await makeHarness();
        const k = kit();
        const [A, B, C] = [k.account(), k.account(), k.account()];
        const results = await Promise.allSettled([
          deliver(h, k.note(A, 1), k.note(B, 1)),
          deliver(h, k.note(B, 1), k.note(C, 1)),
        ]);
        expect(results.map((r) => r.status)).toEqual([
          "fulfilled",
          "fulfilled",
        ]);
        for (const who of [A, B, C]) {
          expect((await find(h, who)).count).toBe(1);
        }
      });

      it("notificationRepository#28 A にキー K1 の通知がある / A の removeAllByRecipient と、A へのキー K2 の通知の deliverAll を、2つの UnitOfWork で同時に実行する", async () => {
        const h = await makeHarness();
        const k = kit();
        const A = k.account();
        await deliver(h, k.note(A, 1));
        const k2 = k.note(A, 2);
        const results = await Promise.allSettled([
          remove(h, A),
          deliver(h, k2),
        ]);
        expect(results.map((r) => r.status)).toEqual([
          "fulfilled",
          "fulfilled",
        ]);
        const items = (await find(h, A)).items;
        expect(
          items.length === 0 || (items.length === 1 && items[0]?.id === k2.id),
        ).toBe(true);
      });

      it("notificationRepository#29 A の通知がある / A の removeAllByRecipient を、2つの UnitOfWork で同時に実行する", async () => {
        const h = await makeHarness();
        const k = kit();
        const A = k.account();
        await deliver(h, k.note(A, 1), k.note(A, 2));
        const results = await Promise.allSettled([remove(h, A), remove(h, A)]);
        expect(results.map((r) => r.status)).toEqual([
          "fulfilled",
          "fulfilled",
        ]);
        expect(await find(h, A)).toEqual({ items: [], count: 0 });
      });
    });

    describe("可視性と UnitOfWork", () => {
      it("notificationRepository#30 UnitOfWork の中で deliverAll し、コミットした / コミットの直後に findByRecipient で読む", async () => {
        const h = await makeHarness();
        const k = kit();
        const A = k.account();
        const n = k.note(A, 1);
        await deliver(h, n);
        expect((await find(h, A)).items).toEqual([n]);
      });

      it("notificationRepository#31 UnitOfWork の中で removeAllByRecipient し、コミットした / コミットの直後に findByRecipient で読む", async () => {
        const h = await makeHarness();
        const k = kit();
        const A = k.account();
        await deliver(h, k.note(A, 1));
        await remove(h, A);
        expect((await find(h, A)).count).toBe(0);
      });

      it("notificationRepository#32 通知がない / UnitOfWork の中で A・B・C への通知を deliverAll し、その後に例外を投げる", async () => {
        const h = await makeHarness();
        const k = kit();
        const people = [k.account(), k.account(), k.account()];
        await expect(
          h.uow.run(async ({ notificationRepository }) => {
            await notificationRepository.deliverAll(
              people.map((who) => k.note(who, 1)),
            );
            throw new ScopeAbort();
          }),
        ).rejects.toBeInstanceOf(ScopeAbort);
        for (const who of people) {
          expect(await find(h, who)).toEqual({ items: [], count: 0 });
        }
      });

      it("notificationRepository#33 A にキー K1 の通知がある / UnitOfWork の中で、A へのキー K1 の通知と B へのキー K1 の通知を deliverAll し、その後に例外を投げる", async () => {
        const h = await makeHarness();
        const k = kit();
        const [A, B] = [k.account(), k.account()];
        const a = k.note(A, 1, { createdAt: at(1) });
        await deliver(h, a);
        await expect(
          h.uow.run(async ({ notificationRepository }) => {
            await notificationRepository.deliverAll([
              k.note(A, 1, { createdAt: at(2) }),
              k.note(B, 1, { createdAt: at(2) }),
            ]);
            throw new ScopeAbort();
          }),
        ).rejects.toBeInstanceOf(ScopeAbort);
        expect((await find(h, A)).items).toEqual([a]);
        expect((await find(h, B)).items).toEqual([]);
      });

      it("notificationRepository#34 A の通知が3件 / UnitOfWork の中で removeAllByRecipient し、その後に例外を投げる", async () => {
        const h = await makeHarness();
        const k = kit();
        const A = k.account();
        const notes = [k.note(A, 3), k.note(A, 2), k.note(A, 1)];
        await deliver(h, ...notes);
        await expect(
          h.uow.run(async ({ notificationRepository }) => {
            await notificationRepository.removeAllByRecipient(A);
            throw new ScopeAbort();
          }),
        ).rejects.toBeInstanceOf(ScopeAbort);
        expect(await find(h, A)).toEqual({ items: notes, count: 3 });
      });
    });
  });
}
