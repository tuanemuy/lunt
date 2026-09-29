import { ApplicationEvents } from "@repo/core/domain/application/events";
import { AuthorityEvents } from "@repo/core/domain/authority/events";
import type { PlaceRef } from "@repo/core/domain/authority/stewardship";
import type { AccountId, CategoryId } from "@repo/core/domain/common/ids";
import { ArticleId, ListingId, PhotoId } from "@repo/core/domain/common/ids";
import { LocalDate } from "@repo/core/domain/common/localDate";
import { PhotosTakenDownEvent } from "@repo/core/domain/common/photoEvents";
import type { ContentRef, StewardedRef } from "@repo/core/domain/common/refs";
import { ListingEvents } from "@repo/core/domain/listing/events";
import { ModerationEvents } from "@repo/core/domain/moderation/events";
import type { NotifiableEvent } from "@repo/core/domain/notification/announcement";
import {
  DeliveredOccurrence,
  type Delivery,
} from "@repo/core/domain/notification/delivery";
import { NotificationDestination } from "@repo/core/domain/notification/destination";
import type { Notification } from "@repo/core/domain/notification/notification";
import { Occurrence } from "@repo/core/domain/notification/occurrence";
import type { NotificationRepository } from "@repo/core/domain/notification/ports/notificationRepository";
import { OccasionEvents } from "@repo/core/domain/occasion/events";
import { PlaceEvents } from "@repo/core/domain/place/events";
import { RegionEvents } from "@repo/core/domain/region/events";
import { describe, expect, it } from "vitest";
import { planAnnouncements } from "../deliverNotifications";
import { applicationFixtures } from "./applicationFixtures";
import { type Kit, notificationKit, type Person } from "./kit";

/** The shared preconditions of `spec/testcases/notification/deliverNotifications.md`. */
async function world(k: Kit) {
  const [O1, O2, E1, E2, S1, S2, RS1, RS2, CS1, CS2] = (await Promise.all(
    ["o1", "o2", "e1", "e2", "s1", "s2", "rs1", "rs2", "cs1", "cs2"].map((l) =>
      k.person(l),
    ),
  )) as [
    Person,
    Person,
    Person,
    Person,
    Person,
    Person,
    Person,
    Person,
    Person,
    Person,
  ];
  await k.operators(O1, O2);
  await k.editors(E1, E2);
  const P = k.place("店舗P");
  const V = k.place("店舗V");
  const R = k.region("地域R");
  const RV = k.region("地域RV");
  const C = k.occasion("イベントC");
  const CV = k.occasion("イベントCV");
  await k.appoint(P, S1, S2);
  await k.appoint(R, RS1, RS2);
  await k.appoint(C, CS1, CS2);
  return { O1, O2, E1, E2, S1, S2, RS1, RS2, CS1, CS2, P, V, R, RV, C, CV };
}

type Who = Readonly<{ accountId: AccountId; email: string }>;

/** `who` holds exactly the notifications and mails of `expected`, in order of consumption. */
async function expectReceived(
  k: Kit,
  who: Who,
  expected: readonly Readonly<{
    occurrence: Record<string, unknown>;
    delivery: Delivery;
  }>[],
): Promise<readonly Notification[]> {
  const notes = [...(await k.notificationsOf(who))].reverse();
  expect(notes).toHaveLength(expected.length);
  const mails = k.mailsTo(who);
  expect(mails).toHaveLength(expected.length);
  for (const [i, e] of expected.entries()) {
    const note = notes[i];
    expect(note).toMatchObject(e);
    if (note === undefined) continue;
    expect(mails[i]?.subject).toBe(`[${note.occurrence.to}] ${note.delivery}`);
    expect(mails[i]?.link).toEqual(NotificationDestination.of(note));
  }
  return notes;
}

async function expectNothing(k: Kit, ...who: readonly Who[]): Promise<void> {
  for (const w of who) {
    expect(await k.notificationsOf(w)).toEqual([]);
    expect(k.mailsTo(w)).toEqual([]);
  }
}

const individual = (who: Person) =>
  ({ kind: "individual", accountId: who.accountId }) as const;
const asPlace = (p: PlaceRef) => ({ kind: "place", placeId: p.id }) as const;
const steward = (
  target: Extract<StewardedRef, { kind: "region" | "occasion" }>,
) => ({ kind: "steward", target }) as const;
const OPERATOR = { kind: "operator" } as const;

/** The labels each announcement of `e` carries into its mails. */
const labelsOfEvent = async (k: Kit, e: NotifiableEvent) =>
  (await planAnnouncements(k.container, e)).map((planned) => planned.labels);

type ListingRef = Extract<ContentRef, { kind: "listing" }>;
type ContentMatterKind = "suspended" | "unsuspended" | "photos_taken_down";

const placeSuspended = (k: Kit, p: PlaceRef) =>
  k.event(PlaceEvents.suspended(p.id, k.tick()));

/** `contentManagers` occurrence of a place (named for its first use). */
const suspendedOf = (p: PlaceRef, kind: ContentMatterKind) => ({
  to: "contentManagers",
  content: p,
  matter: { kind },
});

const listingMatter = (
  l: ListingRef,
  p: PlaceRef,
  kind: ContentMatterKind,
) => ({
  to: "contentManagers",
  content: l,
  placeId: p.id,
  matter: { kind },
});

const categoryRetired = (k: Kit, id: CategoryId) =>
  k.event(ListingEvents.categoryRetired(id, k.tick()));

const reassigned = (p: PlaceRef, retiredCategoryId: CategoryId) => ({
  to: "placeStewards",
  placeId: p.id,
  subject: {
    kind: "place",
    matter: { kind: "categories_reassigned", retiredCategoryId },
  },
});

let photoSerial = 0;
const photosTakenDown = (k: Kit, owner: ContentRef, unpublished: boolean) => {
  photoSerial += 1;
  return k.event(
    PhotosTakenDownEvent.draft(
      {
        owner,
        photoIds: [
          PhotoId.create(
            `00000000-0000-7000-8000-${photoSerial.toString(16).padStart(12, "0")}`,
          ),
        ],
        unpublished,
      },
      k.tick(),
    ),
  );
};

const APPLICANT_EVENTS = [
  ["returned", ApplicationEvents.returned],
  ["approved", ApplicationEvents.approved],
  ["rejected", ApplicationEvents.rejected],
  ["lapsed", ApplicationEvents.lapsed],
] as const;
const APPROVER_EVENTS = [
  ["submitted", ApplicationEvents.submitted],
  ["resubmitted", ApplicationEvents.resubmitted],
  ["withdrawn", ApplicationEvents.withdrawn],
] as const;

type RegionRef = Extract<StewardedRef, { kind: "region" }>;
type OccasionRef = Extract<StewardedRef, { kind: "occasion" }>;

/** A `placeStewards` occurrence about place `p` itself. */
const placeMatterOf = (p: PlaceRef, matter: Record<string, unknown>) => ({
  to: "placeStewards",
  placeId: p.id,
  subject: { kind: "place", matter },
});

const contentMatterOf = (
  content: RegionRef | OccasionRef,
  kind: ContentMatterKind,
) => ({ to: "contentManagers", content, matter: { kind } });

/**
 * A kit whose notification record fails while its recipients include
 * `failing.recipient` (`null`: never fails).
 */
function recordFailingKit() {
  const failing: { recipient: AccountId | null } = { recipient: null };
  const k = notificationKit({
    overrides: (c) => ({
      unitOfWorkProvider: {
        run: (fn) =>
          c.unitOfWorkProvider.run((ctx) => {
            const inner = ctx.notificationRepository;
            const repository: NotificationRepository = {
              deliverAll: async (notifications) => {
                if (
                  notifications.some((n) => n.recipient === failing.recipient)
                ) {
                  throw new Error("record failed");
                }
                await inner.deliverAll(notifications);
              },
              removeAllByRecipient: (r) => inner.removeAllByRecipient(r),
              findByRecipient: (r, pagination) =>
                inner.findByRecipient(r, pagination),
            };
            return fn({ ...ctx, notificationRepository: repository });
          }),
      },
    }),
  });
  return { k, failing };
}

/**
 * Consumes each event, then checks the operators O1 and O2 received each
 * one by proxy for `vacant`, pointing at its paired content, in order.
 */
async function expectProxied(
  k: Kit,
  w: Awaited<ReturnType<typeof world>>,
  vacant: StewardedRef,
  cases: readonly (readonly [NotifiableEvent, ContentRef])[],
): Promise<void> {
  for (const [e] of cases) await k.consume(e);
  for (const who of [w.O1, w.O2]) {
    const notes = [...(await k.notificationsOf(who))].reverse();
    expect(notes).toHaveLength(cases.length);
    expect(k.mailsTo(who)).toHaveLength(cases.length);
    for (const [i, [, pointed]] of cases.entries()) {
      const note = notes[i];
      if (note === undefined) throw new Error("missing");
      expect(note.delivery).toBe("proxy");
      expect(DeliveredOccurrence.vacantTarget(note)).toEqual(vacant);
      expect(Occurrence.pointedContent(note.occurrence)).toEqual(pointed);
      expect(k.mailsTo(who)[i]?.link).toEqual(NotificationDestination.of(note));
    }
  }
}

describe("deliverNotifications", () => {
  describe("記録とメール", () => {
    it("deliverNotifications#1 利用者 U が個人として行った申請 Ap が差し戻された / Ap の application.returned を消費する", async () => {
      const k = notificationKit();
      const w = await world(k);
      const U = await k.person("u");
      const apps = applicationFixtures(k);
      const { Ap1: Ap } = await apps.registration(U, "山田珈琲店");
      await apps.sendBack(w.O1, Ap);
      const before = await k.storedEventCount();
      const e = k.event(
        ApplicationEvents.returned(Ap, individual(U), k.tick()),
      );
      await expect(k.consume(e)).resolves.toBeUndefined();
      const [note] = await expectReceived(k, U, [
        {
          occurrence: {
            to: "applicant",
            applicant: { kind: "individual" },
            applicationId: Ap,
            matter: "returned",
          },
          delivery: "direct",
        },
      ]);
      expect(note?.createdAt).toEqual(k.clock.now());
      const label = {
        applicationKind: "registration",
        subjects: [{ kind: "place", name: "山田珈琲店" }],
      };
      expect(k.mailsTo(U)[0]?.body).toContain(
        `application:${Ap}=${JSON.stringify(label)}`,
      );
      expect(await labelsOfEvent(k, e)).toEqual([
        [{ ref: { kind: "application", id: Ap }, label }],
      ]);
      expect(await k.storedEventCount()).toBe(before);
    });

    it("deliverNotifications#2 上の消費の後 / 同じ application.returned をもう一度消費する", async () => {
      const k = notificationKit();
      await world(k);
      const U = await k.person("u");
      const e = k.event(
        ApplicationEvents.returned(k.applicationId(), individual(U), k.tick()),
      );
      await k.consume(e);
      const [first] = await k.notificationsOf(U);
      await k.consume(e);
      const after = await k.notificationsOf(U);
      expect(after).toHaveLength(1);
      expect(after[0]?.id).toBe(first?.id);
      expect(after[0]?.createdAt).toEqual(first?.createdAt);
      expect(k.mailsTo(U)).toHaveLength(1);
    });

    it("deliverNotifications#3 店舗 P が運営による非公開になった。Mailer.send がどの宛先にも失敗する / place.suspended を消費する", async () => {
      const k = notificationKit();
      const w = await world(k);
      k.mailer.failWhen(() => true);
      await k.consumeFailing(placeSuspended(k, w.P));
      for (const who of [w.S1, w.S2]) {
        expect(await k.notificationsOf(who)).toEqual([
          expect.objectContaining({
            occurrence: suspendedOf(w.P, "suspended"),
            delivery: "direct",
          }),
        ]);
      }
      expect(k.mailer.sent).toEqual([]);
    });
    it("deliverNotifications#4 上の失敗の後、Mailer.send が成功するようになった / 同じ place.suspended をもう一度消費する", async () => {
      const k = notificationKit();
      const w = await world(k);
      const e = placeSuspended(k, w.P);
      k.mailer.failWhen(() => true);
      await k.consumeFailing(e);
      k.mailer.failWhen(null);
      await k.consume(e);
      for (const who of [w.S1, w.S2]) {
        await expectReceived(k, who, [
          { occurrence: suspendedOf(w.P, "suspended"), delivery: "direct" },
        ]);
      }
    });
    it("deliverNotifications#5 Mailer.send が S1 への送信だけに失敗する / place.suspended を消費する", async () => {
      const k = notificationKit();
      const w = await world(k);
      k.mailer.failWhen((mail) => mail.to === w.S1.email);
      await k.consumeFailing(placeSuspended(k, w.P));
      expect(await k.notificationsOf(w.S1)).toHaveLength(1);
      expect(k.mailsTo(w.S1)).toEqual([]);
      await expectReceived(k, w.S2, [
        { occurrence: suspendedOf(w.P, "suspended"), delivery: "direct" },
      ]);
    });
    it("deliverNotifications#6 上の失敗の後、Mailer.send が成功するようになった / 同じ place.suspended をもう一度消費する", async () => {
      const k = notificationKit();
      const w = await world(k);
      const e = placeSuspended(k, w.P);
      k.mailer.failWhen((mail) => mail.to === w.S1.email);
      await k.consumeFailing(e);
      k.mailer.failWhen(null);
      await k.consume(e);
      for (const who of [w.S1, w.S2]) {
        await expectReceived(k, who, [
          { occurrence: suspendedOf(w.P, "suspended"), delivery: "direct" },
        ]);
      }
    });
    async function cancelledWithFailingQ() {
      const { k, failing } = recordFailingKit();
      const w = await world(k);
      const T1 = await k.person("t1");
      const Q = k.place("店舗Q");
      await k.appoint(Q, T1);
      await k.participate(w.C, w.P, Q);
      const e = k.event(OccasionEvents.cancelled(w.C.id, k.tick()));
      failing.recipient = T1.accountId;
      await expect(k.consumeFailing(e)).resolves.toEqual(
        new Error("record failed"),
      );
      return { k, w, failing, T1, Q, e };
    }
    const cancelledOf = (p: PlaceRef, C: OccasionRef) =>
      placeMatterOf(p, { kind: "occasion_cancelled", occasionId: C.id });
    it("deliverNotifications#7 イベント C に店舗 P と店舗 Q（店舗管理者は T1）が参加中。店舗 Q の店舗管理者への通知の記録だけが成立しない / occasion.cancelled を消費する", async () => {
      const { k, w, T1 } = await cancelledWithFailingQ();
      for (const who of [w.S1, w.S2]) {
        await expectReceived(k, who, [
          { occurrence: cancelledOf(w.P, w.C), delivery: "direct" },
        ]);
      }
      await expectNothing(k, T1);
    });
    it("deliverNotifications#8 上の失敗の後、記録が成立するようになった / 同じ occasion.cancelled をもう一度消費する", async () => {
      const { k, w, failing, T1, Q, e } = await cancelledWithFailingQ();
      failing.recipient = null;
      await expect(k.consume(e)).resolves.toBeUndefined();
      await expectReceived(k, T1, [
        { occurrence: cancelledOf(Q, w.C), delivery: "direct" },
      ]);
      for (const who of [w.S1, w.S2]) {
        await expectReceived(k, who, [
          { occurrence: cancelledOf(w.P, w.C), delivery: "direct" },
        ]);
      }
    });
    it("deliverNotifications#9 店舗 P の place.suspended の消費が、通知の記録の後、メールの送信の前に失敗した。再配送までに、S2 が店舗管理者を辞任し、S3 が店舗管理者に就いた / 同じ place.suspended をもう一度消費する", async () => {
      const k = notificationKit();
      const w = await world(k);
      const e = placeSuspended(k, w.P);
      k.mailer.failWhen(() => true);
      await k.consumeFailing(e);
      k.mailer.failWhen(null);
      const S3 = await k.person("s3");
      await k.removeSteward(w.P, w.S2);
      await k.appoint(w.P, S3);
      await k.consume(e);
      for (const who of [w.S1, S3]) {
        await expectReceived(k, who, [
          { occurrence: suspendedOf(w.P, "suspended"), delivery: "direct" },
        ]);
      }
      expect(await k.notificationsOf(w.S2)).toHaveLength(1);
      expect(k.mailsTo(w.S2)).toEqual([]);
    });
    it("deliverNotifications#10 店舗 P が運営による非公開になった後、place.suspended の消費の前に、S2 が退会した（退会は、管理体制からの除去とアカウントの削除を1つの UnitOfWork で確定する） / place.suspended を消費する", async () => {
      const k = notificationKit();
      const w = await world(k);
      const e = placeSuspended(k, w.P);
      await k.withdraw(w.S2);
      await k.consume(e);
      await expectReceived(k, w.S1, [
        { occurrence: suspendedOf(w.P, "suspended"), delivery: "direct" },
      ]);
      await expectNothing(k, w.S2);
    });

    it("deliverNotifications#11 利用者 U が個人として行った申請 Ap が差し戻された後、application.returned の消費の前に、U が退会した / Ap の application.returned を消費する", async () => {
      const k = notificationKit();
      await world(k);
      const U = await k.person("u");
      const e = k.event(
        ApplicationEvents.returned(k.applicationId(), individual(U), k.tick()),
      );
      await k.withdraw(U);
      await k.consume(e);
      await expectNothing(k, U);
      expect(k.mailer.sent).toEqual([]);
    });

    // S5: listing.suspended with a showcasing article (editors).
    it.todo(
      "deliverNotifications#12 S1 が店舗 P の店舗管理者で、編集担当者でもある。公開中の読みもの A が掲載 L を紹介している / 掲載 L の listing.suspended を消費する",
    );
    it("deliverNotifications#13 サービス運営者の名簿が開設前（サービス運営者がいない）。店舗 V は店舗管理者が不在 / 店舗 V の place.suspended を消費する", async () => {
      const k = notificationKit();
      const V = k.place("店舗V");
      await expect(k.consume(placeSuspended(k, V))).resolves.toBeUndefined();
      expect(k.mailer.sent).toEqual([]);
    });
    it("deliverNotifications#14 サービス運営者の名簿が開設前 / takedown_claim.submitted を消費する", async () => {
      const k = notificationKit();
      const S1 = await k.person("s1");
      const P = k.place("店舗P");
      await k.appoint(P, S1);
      const Cl = await k.takedownClaim(P);
      await expect(
        k.consume(
          k.event(ModerationEvents.takedownClaimSubmitted(Cl, k.tick())),
        ),
      ).resolves.toBeUndefined();
      await expectNothing(k, S1);
      expect(k.mailer.sent).toEqual([]);
    });
  });

  describe("告知にならないドメインイベント", () => {
    it('deliverNotifications#15 招待の承諾で S3 が店舗 P の店舗管理者に就いた / authority.steward_appointed（via: "invitation"）を消費する', async () => {
      const k = notificationKit();
      const w = await world(k);
      const S3 = await k.person("s3");
      await k.appoint(w.P, S3);
      await k.consume(
        k.event(
          AuthorityEvents.stewardAppointed(
            w.P,
            S3.accountId,
            "invitation",
            k.tick(),
          ),
        ),
      );
      await expectNothing(k, w.S1, w.S2, S3, w.O1, w.O2);
      expect(k.mailer.sent).toEqual([]);
    });

    it('deliverNotifications#16 S2 が店舗 P の店舗管理者を辞任した。別に、退会で管理権限を失った / authority.steward_removed（reason: "resigned"）、（reason: "withdrawn"）をそれぞれ消費する', async () => {
      const k = notificationKit();
      const w = await world(k);
      await k.removeSteward(w.P, w.S2);
      for (const reason of ["resigned", "withdrawn"] as const) {
        await expect(
          k.consume(
            k.event(
              AuthorityEvents.stewardRemoved(
                w.P,
                w.S2.accountId,
                reason,
                k.tick(),
              ),
            ),
          ),
        ).resolves.toBeUndefined();
      }
      await expectNothing(k, w.S1, w.S2, w.O1, w.O2);
      expect(k.mailer.sent).toEqual([]);
    });

    it('deliverNotifications#17 役割を持つ人が退会した / authority.role_revoked（reason: "withdrawn"）を消費する', async () => {
      const k = notificationKit();
      const w = await world(k);
      await k.consume(
        k.event(
          AuthorityEvents.roleRevoked(
            "editor",
            w.E2.accountId,
            "withdrawn",
            k.tick(),
          ),
        ),
      );
      await expectNothing(k, w.E1, w.E2, w.O1, w.O2);
      expect(k.mailer.sent).toEqual([]);
    });

    it("deliverNotifications#18 店舗 P が休業になった / place.operating_status_changed（to が休業）を消費する", async () => {
      const k = notificationKit();
      const w = await world(k);
      await k.consume(
        k.event(
          PlaceEvents.operatingStatusChanged(
            w.P.id,
            "open",
            "temporarilyClosed",
            k.tick(),
          ),
        ),
      );
      await expectNothing(k, w.S1, w.S2, w.O1, w.E1);
      expect(k.mailer.sent).toEqual([]);
    });
    it('deliverNotifications#19 イベント運営者が、店舗 V の参加内容を変更した / occasion.participation_changed（changedBy: "occasion"）を消費する', async () => {
      const k = notificationKit();
      const w = await world(k);
      await k.participate(w.C, w.V);
      await expect(
        k.consume(
          k.event(
            OccasionEvents.participationChanged(
              w.C.id,
              w.V.id,
              "occasion",
              k.tick(),
            ),
          ),
        ),
      ).resolves.toBeUndefined();
      await expectNothing(k, w.CS1, w.CS2, w.O1, w.O2);
      expect(k.mailer.sent).toEqual([]);
    });
    it('deliverNotifications#20 離脱の承認で店舗 P の地域 R への所属が解除された / region.affiliation_dissolved（cause: "left"）を消費する', async () => {
      const k = notificationKit();
      const w = await world(k);
      await expect(
        k.consume(
          k.event(
            RegionEvents.affiliationDissolved(w.P.id, w.R.id, "left", k.tick()),
          ),
        ),
      ).resolves.toBeUndefined();
      await expectNothing(k, w.S1, w.S2, w.RS1, w.RS2, w.O1);
      expect(k.mailer.sent).toEqual([]);
    });
  });

  describe("申請者宛て（P-91）", () => {
    it("deliverNotifications#21 利用者 U が個人として行った申請 Ap / Ap の application.returned、application.approved、application.rejected、application.lapsed をそれぞれ消費する", async () => {
      const k = notificationKit();
      const w = await world(k);
      const U = await k.person("u");
      const Ap = k.applicationId();
      for (const [, make] of APPLICANT_EVENTS) {
        await k.consume(k.event(make(Ap, individual(U), k.tick())));
      }
      const notes = await expectReceived(
        k,
        U,
        APPLICANT_EVENTS.map(([matter]) => ({
          occurrence: {
            to: "applicant",
            applicant: { kind: "individual" },
            applicationId: Ap,
            matter,
          },
          delivery: "direct",
        })),
      );
      for (const note of notes) {
        expect(Occurrence.pointedContent(note.occurrence)).toBeNull();
      }
      await expectNothing(k, w.O1, w.S1);
    });

    it("deliverNotifications#22 利用者 U が管理者のいない店舗 V に行った掲載の申請 Ap が、店舗管理者の就任で失効した / Ap の application.lapsed を消費する", async () => {
      const k = notificationKit();
      const w = await world(k);
      const U = await k.person("u");
      const S3 = await k.person("s3");
      await k.appoint(w.V, S3);
      const Ap = k.applicationId();
      await k.consume(
        k.event(ApplicationEvents.lapsed(Ap, individual(U), k.tick())),
      );
      await expectReceived(k, U, [
        {
          occurrence: { to: "applicant", applicationId: Ap, matter: "lapsed" },
          delivery: "direct",
        },
      ]);
      await expectNothing(k, S3, w.O1);
    });

    it("deliverNotifications#23 S1 が店舗 P の店舗管理者として行った申請 Ap（applicant は店舗 P） / Ap の application.returned、application.approved、application.rejected、application.lapsed をそれぞれ消費する", async () => {
      const k = notificationKit();
      const w = await world(k);
      const Ap = k.applicationId();
      for (const [, make] of APPLICANT_EVENTS) {
        await k.consume(k.event(make(Ap, asPlace(w.P), k.tick())));
      }
      for (const who of [w.S1, w.S2]) {
        await expectReceived(
          k,
          who,
          APPLICANT_EVENTS.map(([matter]) => ({
            occurrence: {
              to: "applicant",
              applicant: asPlace(w.P),
              applicationId: Ap,
              matter,
            },
            delivery: "direct",
          })),
        );
      }
      await expectNothing(k, w.O1, w.O2);
    });

    it("deliverNotifications#24 S1 が店舗 P の店舗管理者として申請 Ap を行った後、S1 が辞任し、S3 が店舗管理者に就いた / Ap の application.approved を消費する", async () => {
      const k = notificationKit();
      const w = await world(k);
      const S3 = await k.person("s3");
      await k.removeSteward(w.P, w.S1);
      await k.appoint(w.P, S3);
      const Ap = k.applicationId();
      await k.consume(
        k.event(ApplicationEvents.approved(Ap, asPlace(w.P), k.tick())),
      );
      for (const who of [w.S2, S3]) {
        await expectReceived(k, who, [
          {
            occurrence: {
              to: "applicant",
              applicationId: Ap,
              matter: "approved",
            },
            delivery: "direct",
          },
        ]);
      }
      await expectNothing(k, w.S1);
    });

    it("deliverNotifications#25 店舗管理者として行った申請 Ap の店舗で、最後の店舗管理者が権限を手放し、Ap が失効した。店舗は店舗管理者が不在 / Ap の application.lapsed を消費する", async () => {
      const k = notificationKit();
      const w = await world(k);
      const Q = k.place("店舗Q");
      const T1 = await k.person("t1");
      await k.appoint(Q, T1);
      await k.removeSteward(Q, T1);
      const Ap = k.applicationId();
      await k.consume(
        k.event(ApplicationEvents.lapsed(Ap, asPlace(Q), k.tick())),
      );
      for (const who of [w.O1, w.O2]) {
        const [note] = await expectReceived(k, who, [
          {
            occurrence: {
              to: "applicant",
              applicationId: Ap,
              matter: "lapsed",
            },
            delivery: "proxy",
          },
        ]);
        if (note === undefined) throw new Error("missing");
        expect(DeliveredOccurrence.vacantTarget(note)).toEqual(Q);
      }
      await expectNothing(k, T1);
    });

    it("deliverNotifications#26 サービス運営者の代行で承認された申請 Ap（申請者は利用者 U） / Ap の application.approved を消費する", async () => {
      const k = notificationKit();
      const w = await world(k);
      const U = await k.person("u");
      const Ap = k.applicationId();
      await k.consume(
        k.event(ApplicationEvents.approved(Ap, individual(U), k.tick())),
      );
      await expectReceived(k, U, [
        {
          occurrence: {
            to: "applicant",
            applicationId: Ap,
            matter: "approved",
          },
          delivery: "direct",
        },
      ]);
      await expectNothing(k, w.O1, w.O2);
    });
  });

  describe("承認者宛て（P-92）", () => {
    it("deliverNotifications#27 承認者の席が operator の申請 Ap（店舗の登録申請） / Ap の application.submitted、application.resubmitted、application.withdrawn をそれぞれ消費する", async () => {
      const k = notificationKit();
      const w = await world(k);
      const Ap = k.applicationId();
      for (const [, make] of APPROVER_EVENTS) {
        await k.consume(k.event(make(Ap, OPERATOR, k.tick())));
      }
      for (const who of [w.O1, w.O2]) {
        await expectReceived(
          k,
          who,
          APPROVER_EVENTS.map(([matter]) => ({
            occurrence: {
              to: "approver",
              approver: OPERATOR,
              applicationId: Ap,
              matter,
            },
            delivery: "direct",
          })),
        );
      }
    });

    it("deliverNotifications#28 登録申請 Ap1 に管理権限の申請 Ap2 を併せて提出した。店舗はまだない / Ap1 と Ap2 の application.submitted をそれぞれ消費する", async () => {
      const k = notificationKit();
      const w = await world(k);
      const U = await k.person("u");
      const { Ap1, Ap2 } = await applicationFixtures(k).registration(
        U,
        "新しい店",
        { companion: true },
      );
      if (Ap2 === null) throw new Error("no companion claim");
      const events = [Ap1, Ap2].map((Ap) =>
        k.event(ApplicationEvents.submitted(Ap, OPERATOR, k.tick())),
      );
      const place = [{ kind: "place", name: "新しい店" }];
      expect(await Promise.all(events.map((e) => labelsOfEvent(k, e)))).toEqual(
        [
          [
            [
              {
                ref: { kind: "application", id: Ap1 },
                label: { applicationKind: "registration", subjects: place },
              },
            ],
          ],
          [
            [
              {
                ref: { kind: "application", id: Ap2 },
                label: { applicationKind: "stewardship", subjects: place },
              },
            ],
          ],
        ],
      );
      for (const e of events) await k.consume(e);
      for (const who of [w.O1, w.O2]) {
        await expectReceived(
          k,
          who,
          [Ap1, Ap2].map((applicationId) => ({
            occurrence: {
              to: "approver",
              approver: OPERATOR,
              applicationId,
              matter: "submitted",
            },
            delivery: "direct",
          })),
        );
        for (const mail of k.mailsTo(who)) {
          expect(mail.body).toContain('"name":"新しい店"');
        }
      }
    });
    it("deliverNotifications#29 利用者 U が、管理者のいない店舗 V に掲載の申請 Ap を提出した。掲載はまだない / Ap の application.submitted を消費する", async () => {
      const k = notificationKit();
      const w = await world(k);
      const U = await k.person("u");
      const V = await k.registeredPlace("店舗V");
      const Ap = await applicationFixtures(k).newListing(U, V, "季節のパフェ");
      const e = k.event(ApplicationEvents.submitted(Ap, OPERATOR, k.tick()));
      const [labels] = await labelsOfEvent(k, e);
      const labelled = labels?.[0];
      expect(labelled?.ref).toEqual({ kind: "application", id: Ap });
      expect(labelled?.label).toEqual({
        applicationKind: "listing",
        subjects: [
          { kind: "place", name: "店舗V" },
          { kind: "listing", name: "季節のパフェ" },
        ],
      });
      await k.consume(e);
      for (const who of [w.O1, w.O2]) {
        await expectReceived(k, who, [
          {
            occurrence: {
              to: "approver",
              approver: OPERATOR,
              applicationId: Ap,
              matter: "submitted",
            },
            delivery: "direct",
          },
        ]);
        expect(k.mailsTo(who)[0]?.body).toContain('"name":"季節のパフェ"');
        expect(k.mailsTo(who)[0]?.body).toContain('"name":"店舗V"');
      }
    });

    it("deliverNotifications#30 承認者の席が地域 R の steward の所属申請 Ap / Ap の application.submitted、application.resubmitted、application.withdrawn をそれぞれ消費する", async () => {
      const k = notificationKit();
      const w = await world(k);
      const Ap = k.applicationId();
      for (const [, make] of APPROVER_EVENTS) {
        await k.consume(k.event(make(Ap, steward(w.R), k.tick())));
      }
      for (const who of [w.RS1, w.RS2]) {
        await expectReceived(
          k,
          who,
          APPROVER_EVENTS.map(([matter]) => ({
            occurrence: { to: "approver", approver: steward(w.R), matter },
            delivery: "direct",
          })),
        );
      }
      await expectNothing(k, w.O1, w.O2);
    });

    it("deliverNotifications#31 承認者の席がイベント C の steward の参加申請 Ap / Ap の application.submitted を消費する", async () => {
      const k = notificationKit();
      const w = await world(k);
      await k.consume(
        k.event(
          ApplicationEvents.submitted(
            k.applicationId(),
            steward(w.C),
            k.tick(),
          ),
        ),
      );
      for (const who of [w.CS1, w.CS2]) {
        await expectReceived(k, who, [
          {
            occurrence: {
              to: "approver",
              approver: steward(w.C),
              matter: "submitted",
            },
            delivery: "direct",
          },
        ]);
      }
      await expectNothing(k, w.O1, w.O2);
    });

    it("deliverNotifications#32 承認者の席が、地域運営者が不在の地域 RV の steward の所属申請 Ap / Ap の application.submitted、application.resubmitted、application.withdrawn をそれぞれ消費する", async () => {
      const k = notificationKit();
      const w = await world(k);
      const Ap = k.applicationId();
      for (const [, make] of APPROVER_EVENTS) {
        await k.consume(k.event(make(Ap, steward(w.RV), k.tick())));
      }
      for (const who of [w.O1, w.O2]) {
        const notes = await expectReceived(
          k,
          who,
          APPROVER_EVENTS.map(([matter]) => ({
            occurrence: { to: "approver", applicationId: Ap, matter },
            delivery: "proxy",
          })),
        );
        for (const note of notes) {
          expect(DeliveredOccurrence.vacantTarget(note)).toEqual(w.RV);
        }
      }
    });

    it("deliverNotifications#33 承認者の席が、イベント運営者が不在のイベント CV の steward の参加申請 Ap / Ap の application.submitted を消費する", async () => {
      const k = notificationKit();
      const w = await world(k);
      await k.consume(
        k.event(
          ApplicationEvents.submitted(
            k.applicationId(),
            steward(w.CV),
            k.tick(),
          ),
        ),
      );
      for (const who of [w.O1, w.O2]) {
        const [note] = await expectReceived(k, who, [
          { occurrence: { to: "approver" }, delivery: "proxy" },
        ]);
        if (note === undefined) throw new Error("missing");
        expect(DeliveredOccurrence.vacantTarget(note)).toEqual(w.CV);
      }
    });

    it("deliverNotifications#34 O1 が自分で店舗の登録申請 Ap を提出した / Ap の application.submitted を消費する", async () => {
      const k = notificationKit();
      const w = await world(k);
      await k.consume(
        k.event(
          ApplicationEvents.submitted(k.applicationId(), OPERATOR, k.tick()),
        ),
      );
      for (const who of [w.O1, w.O2]) {
        await expectReceived(k, who, [
          {
            occurrence: { to: "approver", matter: "submitted" },
            delivery: "direct",
          },
        ]);
      }
    });

    it("deliverNotifications#35 利用者 U の退会で、U が個人として行った地域 R への申請 Ap が取り下げになった。U のアカウントはない / Ap の application.withdrawn を消費する", async () => {
      const k = notificationKit();
      const w = await world(k);
      const U = await k.person("u");
      await k.withdraw(U);
      await k.consume(
        k.event(
          ApplicationEvents.withdrawn(
            k.applicationId(),
            steward(w.R),
            k.tick(),
          ),
        ),
      );
      for (const who of [w.RS1, w.RS2]) {
        await expectReceived(k, who, [
          {
            occurrence: { to: "approver", matter: "withdrawn" },
            delivery: "direct",
          },
        ]);
      }
    });
  });

  describe("店舗管理者宛て（P-93）", () => {
    it('deliverNotifications#36 店舗 P が地域 R から除外された / region.affiliation_dissolved（cause: "excluded"）を消費する', async () => {
      const k = notificationKit();
      const w = await world(k);
      await k.consume(
        k.event(
          RegionEvents.affiliationDissolved(
            w.P.id,
            w.R.id,
            "excluded",
            k.tick(),
          ),
        ),
      );
      for (const who of [w.S1, w.S2]) {
        const [note] = await expectReceived(k, who, [
          {
            occurrence: placeMatterOf(w.P, {
              kind: "excluded_from_region",
              regionId: w.R.id,
            }),
            delivery: "direct",
          },
        ]);
        if (note === undefined) throw new Error("missing");
        expect(Occurrence.pointedContent(note.occurrence)).toEqual(w.P);
      }
      await expectNothing(k, w.RS1, w.RS2);
    });
    it('deliverNotifications#37 店舗 P がイベント C から除外された / occasion.participation_dissolved（cause: "excluded"）を消費する', async () => {
      const k = notificationKit();
      const w = await world(k);
      await k.consume(
        k.event(
          OccasionEvents.participationDissolved(
            w.C.id,
            w.P.id,
            "excluded",
            k.tick(),
          ),
        ),
      );
      for (const who of [w.S1, w.S2]) {
        await expectReceived(k, who, [
          {
            occurrence: placeMatterOf(w.P, {
              kind: "excluded_from_occasion",
              occasionId: w.C.id,
            }),
            delivery: "direct",
          },
        ]);
      }
      await expectNothing(k, w.CS1, w.CS2);
    });
    it("deliverNotifications#38 イベント C に店舗 P と店舗 Q（店舗管理者は T1）が参加中。イベント C を紹介する公開中の読みものはない / occasion.cancelled を消費する", async () => {
      const k = notificationKit();
      const w = await world(k);
      const [T1, X1] = [await k.person("t1"), await k.person("x1")];
      const Q = k.place("店舗Q");
      const X = k.place("店舗X");
      await k.appoint(Q, T1);
      await k.appoint(X, X1);
      await k.participate(w.C, w.P, Q);
      await k.consume(k.event(OccasionEvents.cancelled(w.C.id, k.tick())));
      for (const [who, place] of [
        [w.S1, w.P],
        [w.S2, w.P],
        [T1, Q],
      ] as const) {
        const [note] = await expectReceived(k, who, [
          {
            occurrence: placeMatterOf(place, {
              kind: "occasion_cancelled",
              occasionId: w.C.id,
            }),
            delivery: "direct",
          },
        ]);
        if (note === undefined) throw new Error("missing");
        expect(Occurrence.pointedContent(note.occurrence)).toEqual(place);
      }
      await expectNothing(k, X1, w.CS1, w.E1, w.O1);
    });
    it("deliverNotifications#39 イベント C に店舗 P と、店舗管理者が不在の店舗 V が参加中 / occasion.period_changed を消費する", async () => {
      const k = notificationKit();
      const w = await world(k);
      await k.participate(w.C, w.P, w.V);
      await k.consume(k.event(OccasionEvents.periodChanged(w.C.id, k.tick())));
      const changed = (p: PlaceRef) =>
        placeMatterOf(p, {
          kind: "occasion_period_changed",
          occasionId: w.C.id,
        });
      for (const who of [w.S1, w.S2]) {
        await expectReceived(k, who, [
          { occurrence: changed(w.P), delivery: "direct" },
        ]);
      }
      for (const who of [w.O1, w.O2]) {
        const [note] = await expectReceived(k, who, [
          { occurrence: changed(w.V), delivery: "proxy" },
        ]);
        if (note === undefined) throw new Error("missing");
        expect(DeliveredOccurrence.vacantTarget(note)).toEqual(w.V);
      }
    });
    it("deliverNotifications#40 イベント C に参加中の店舗がない。紹介する公開中の読みものもない / occasion.cancelled を消費する", async () => {
      const k = notificationKit();
      const w = await world(k);
      await expect(
        k.consume(k.event(OccasionEvents.cancelled(w.C.id, k.tick()))),
      ).resolves.toBeUndefined();
      expect(k.mailer.sent).toEqual([]);
      await expectNothing(k, w.S1, w.CS1, w.E1, w.O1);
    });
    it("deliverNotifications#41 店舗 P を対象とする連絡 Rp について、確認が依頼された / info_report.confirmation_requested を消費する", async () => {
      const k = notificationKit();
      const w = await world(k);
      const U = await k.person("u");
      const target = { kind: "place", placeId: w.P.id } as const;
      const Rp = await k.infoReport(target, U);
      await k.consume(
        k.event(
          ModerationEvents.infoReportConfirmationRequested(
            Rp,
            target,
            k.tick(),
          ),
        ),
      );
      for (const who of [w.S1, w.S2]) {
        const [note] = await expectReceived(k, who, [
          {
            occurrence: {
              to: "placeStewards",
              placeId: w.P.id,
              subject: {
                kind: "place",
                matter: { kind: "confirmation_requested", reportId: Rp },
              },
            },
            delivery: "direct",
          },
        ]);
        if (note === undefined) throw new Error("missing");
        expect(Occurrence.pointedContent(note.occurrence)).toEqual(w.P);
      }
    });
    it("deliverNotifications#42 掲載 L を対象とする連絡 Rp について、確認が依頼された / info_report.confirmation_requested を消費する", async () => {
      const k = notificationKit();
      const w = await world(k);
      const U = await k.person("u");
      const L = await k.listing(w.P, { name: "掲載L" });
      const target = {
        kind: "listing",
        placeId: w.P.id,
        listingId: L.id,
      } as const;
      const Rp = await k.infoReport(target, U);
      await k.consume(
        k.event(
          ModerationEvents.infoReportConfirmationRequested(
            Rp,
            target,
            k.tick(),
          ),
        ),
      );
      for (const who of [w.S1, w.S2]) {
        const [note] = await expectReceived(k, who, [
          {
            occurrence: {
              to: "placeStewards",
              placeId: w.P.id,
              subject: {
                kind: "listing",
                listingId: L.id,
                matter: { kind: "confirmation_requested", reportId: Rp },
              },
            },
            delivery: "direct",
          },
        ]);
        if (note === undefined) throw new Error("missing");
        expect(Occurrence.pointedContent(note.occurrence)).toEqual(L);
      }
    });
    it("deliverNotifications#43 カテゴリー K が廃止された。店舗 P の掲載 L と掲載 M が、K を CategoryId として保存している / category.retired（categoryId は K）を消費する", async () => {
      const k = notificationKit();
      const w = await world(k);
      const [K, K2] = await k.categories("K", "K2");
      if (K === undefined || K2 === undefined) throw new Error("no category");
      await k.listing(w.P, { categoryId: K });
      await k.listing(w.P, { categoryId: K });
      await k.retireCategory(K, K2);
      await k.consume(categoryRetired(k, K));
      for (const who of [w.S1, w.S2]) {
        const [note] = await expectReceived(k, who, [
          { occurrence: reassigned(w.P, K), delivery: "direct" },
        ]);
        expect(note?.occurrence).toEqual(reassigned(w.P, K));
      }
    });
    it("deliverNotifications#44 カテゴリー K が廃止された。店舗 P の掲載 L と、店舗管理者が不在の店舗 V の掲載 LV が、K を保存している / category.retired（categoryId は K）を消費する", async () => {
      const k = notificationKit();
      const w = await world(k);
      const [K, K2] = await k.categories("K", "K2");
      if (K === undefined || K2 === undefined) throw new Error("no category");
      await k.listing(w.P, { categoryId: K });
      await k.listing(w.V, { categoryId: K });
      await k.retireCategory(K, K2);
      await k.consume(categoryRetired(k, K));
      for (const who of [w.S1, w.S2]) {
        await expectReceived(k, who, [
          { occurrence: reassigned(w.P, K), delivery: "direct" },
        ]);
      }
      for (const who of [w.O1, w.O2]) {
        const [note] = await expectReceived(k, who, [
          { occurrence: reassigned(w.V, K), delivery: "proxy" },
        ]);
        if (note === undefined) throw new Error("missing");
        expect(DeliveredOccurrence.vacantTarget(note)).toEqual(w.V);
      }
    });
    it("deliverNotifications#45 カテゴリー J が、移行先を K として先に廃止されている。店舗 P の掲載 L は J を、店舗 Q の draft の掲載 N は K を保存している。K が廃止された / category.retired（categoryId は K）を消費する", async () => {
      const k = notificationKit();
      const w = await world(k);
      const T1 = await k.person("t1");
      const Q = k.place("店舗Q");
      await k.appoint(Q, T1);
      const [J, K, K2] = await k.categories("J", "K", "K2");
      if (J === undefined || K === undefined || K2 === undefined) {
        throw new Error("no category");
      }
      await k.retireCategory(J, K);
      await k.listing(w.P, { categoryId: J });
      await k.listing(Q, { categoryId: K });
      await k.retireCategory(K, K2);
      await k.consume(categoryRetired(k, K));
      for (const who of [w.S1, w.S2]) {
        await expectReceived(k, who, [
          { occurrence: reassigned(w.P, K), delivery: "direct" },
        ]);
      }
      await expectReceived(k, T1, [
        { occurrence: reassigned(Q, K), delivery: "direct" },
      ]);
    });
    it("deliverNotifications#46 カテゴリー K が廃止された。K と、K に行き着くカテゴリーを保存している掲載が1件もない / category.retired を消費する", async () => {
      const k = notificationKit();
      const w = await world(k);
      const [J, K, K2] = await k.categories("J", "K", "K2");
      if (J === undefined || K === undefined || K2 === undefined) {
        throw new Error("no category");
      }
      await k.listing(w.P, { categoryId: K2 });
      await k.retireCategory(K, K2);
      await expect(k.consume(categoryRetired(k, K))).resolves.toBeUndefined();
      expect(k.mailer.sent).toEqual([]);
      await expectNothing(k, w.S1, w.S2, w.O1, w.O2);
    });
    it("deliverNotifications#47 カテゴリー K が廃止された。店舗 P の掲載 L と掲載 M が、K を保存している / 同じ category.retired を2回消費する", async () => {
      const k = notificationKit();
      const w = await world(k);
      const [K, K2] = await k.categories("K", "K2");
      if (K === undefined || K2 === undefined) throw new Error("no category");
      await k.listing(w.P, { categoryId: K });
      await k.listing(w.P, { categoryId: K });
      await k.retireCategory(K, K2);
      const e = categoryRetired(k, K);
      await k.consume(e);
      await k.consume(e);
      for (const who of [w.S1, w.S2]) {
        await expectReceived(k, who, [
          { occurrence: reassigned(w.P, K), delivery: "direct" },
        ]);
      }
    });

    it('deliverNotifications#48 管理権限の申請の承認で、S3 が店舗 P の店舗管理者に加わった。消費の時点の店舗管理者は S1・S2・S3 / authority.steward_appointed（via: "application"）を消費する', async () => {
      const k = notificationKit();
      const w = await world(k);
      const S3 = await k.person("s3");
      await k.appoint(w.P, S3);
      const before = await k.storedEventCount();
      await k.consume(
        k.event(
          AuthorityEvents.stewardAppointed(
            w.P,
            S3.accountId,
            "application",
            k.tick(),
          ),
        ),
      );
      for (const who of [w.S1, w.S2]) {
        const [note] = await expectReceived(k, who, [
          {
            occurrence: {
              to: "placeStewards",
              placeId: w.P.id,
              subject: {
                kind: "place",
                matter: { kind: "steward_added", appointee: S3.accountId },
              },
            },
            delivery: "direct",
          },
        ]);
        if (note === undefined) throw new Error("missing");
        expect(Occurrence.pointedContent(note.occurrence)).toEqual(w.P);
      }
      await expectNothing(k, S3, w.O1);
      expect(await k.storedEventCount()).toBe(before);
    });

    it('deliverNotifications#49 管理権限の申請の承認で、S3 が店舗管理者のいなかった店舗 V の店舗管理者に就いた。消費の時点の店舗管理者は S3 だけ / authority.steward_appointed（via: "application"）を消費する', async () => {
      const k = notificationKit();
      const w = await world(k);
      const S3 = await k.person("s3");
      await k.appoint(w.V, S3);
      await expect(
        k.consume(
          k.event(
            AuthorityEvents.stewardAppointed(
              w.V,
              S3.accountId,
              "application",
              k.tick(),
            ),
          ),
        ),
      ).resolves.toBeUndefined();
      await expectNothing(k, S3, w.O1, w.O2);
      expect(k.mailer.sent).toEqual([]);
    });

    it("deliverNotifications#50 店舗管理者が不在の店舗 V と、その掲載 LV / 店舗 V の region.affiliation_dissolved（excluded）、occasion.participation_dissolved（excluded）、place.suspended、place.unsuspended、content.photos_taken_down（owner は店舗 V）、info_report.confirmation_requested、掲載 LV の listing.suspended、listing.unsuspended、content.photos_taken_down（owner は掲載 LV）をそれぞれ消費する", async () => {
      const k = notificationKit();
      const w = await world(k);
      const U = await k.person("u");
      const LV = await k.listing(w.V, { name: "掲載LV" });
      const target = { kind: "place", placeId: w.V.id } as const;
      const Rp = await k.infoReport(target, U);
      await expectProxied(k, w, w.V, [
        [
          k.event(
            RegionEvents.affiliationDissolved(
              w.V.id,
              w.R.id,
              "excluded",
              k.tick(),
            ),
          ),
          w.V,
        ],
        [
          k.event(
            OccasionEvents.participationDissolved(
              w.C.id,
              w.V.id,
              "excluded",
              k.tick(),
            ),
          ),
          w.V,
        ],
        [placeSuspended(k, w.V), w.V],
        [k.event(PlaceEvents.unsuspended(w.V.id, k.tick())), w.V],
        [photosTakenDown(k, w.V, false), w.V],
        [
          k.event(
            ModerationEvents.infoReportConfirmationRequested(
              Rp,
              target,
              k.tick(),
            ),
          ),
          w.V,
        ],
        [k.event(ListingEvents.suspended(LV.id, w.V.id, k.tick())), LV],
        [k.event(ListingEvents.unsuspended(LV.id, w.V.id, k.tick())), LV],
        [photosTakenDown(k, LV, true), LV],
      ]);
      await expectNothing(k, w.S1, w.E1, w.RS1, w.CS1);
    });
  });

  describe("地域運営者宛て（P-94）", () => {
    it("deliverNotifications#51 イベント C が地域 R を開催地域として関連づけた / occasion.region_linked を消費する", async () => {
      const k = notificationKit();
      const w = await world(k);
      await k.consume(
        k.event(OccasionEvents.regionLinked(w.C.id, w.R.id, k.tick())),
      );
      for (const who of [w.RS1, w.RS2]) {
        const [note] = await expectReceived(k, who, [
          {
            occurrence: {
              to: "regionStewards",
              regionId: w.R.id,
              matter: { kind: "occasion_linked", occasionId: w.C.id },
            },
            delivery: "direct",
          },
        ]);
        if (note === undefined) throw new Error("missing");
        expect(Occurrence.pointedContent(note.occurrence)).toEqual(w.R);
      }
      await expectNothing(k, w.CS1, w.CS2, w.O1);
    });
    it("deliverNotifications#52 地域運営者が不在の地域 RV / 地域 RV の occasion.region_linked、region.suspended、region.unsuspended、content.photos_taken_down（owner は地域 RV）をそれぞれ消費する", async () => {
      const k = notificationKit();
      const w = await world(k);
      await expectProxied(k, w, w.RV, [
        [k.event(OccasionEvents.regionLinked(w.C.id, w.RV.id, k.tick())), w.RV],
        [k.event(RegionEvents.suspended(w.RV.id, k.tick())), w.RV],
        [k.event(RegionEvents.unsuspended(w.RV.id, k.tick())), w.RV],
        [photosTakenDown(k, w.RV, false), w.RV],
      ]);
      await expectNothing(k, w.RS1, w.CS1);
    });
  });

  describe("イベント運営者宛て（P-95）", () => {
    it('deliverNotifications#53 店舗 P がイベント C への参加を取りやめた / occasion.participation_dissolved（cause: "withdrawn"）を消費する', async () => {
      const k = notificationKit();
      const w = await world(k);
      await k.consume(
        k.event(
          OccasionEvents.participationDissolved(
            w.C.id,
            w.P.id,
            "withdrawn",
            k.tick(),
          ),
        ),
      );
      for (const who of [w.CS1, w.CS2]) {
        const [note] = await expectReceived(k, who, [
          {
            occurrence: {
              to: "occasionStewards",
              occasionId: w.C.id,
              matter: { kind: "participation_withdrawn", placeId: w.P.id },
            },
            delivery: "direct",
          },
        ]);
        if (note === undefined) throw new Error("missing");
        expect(Occurrence.pointedContent(note.occurrence)).toEqual(w.C);
      }
      await expectNothing(k, w.S1, w.S2);
    });
    it('deliverNotifications#54 店舗管理者が、イベント C への参加に添えた掲載と参加日を変更した / occasion.participation_changed（changedBy: "place"）を消費する', async () => {
      const k = notificationKit();
      const w = await world(k);
      await k.participate(w.C, w.P);
      await k.consume(
        k.event(
          OccasionEvents.participationChanged(
            w.C.id,
            w.P.id,
            "place",
            k.tick(),
          ),
        ),
      );
      for (const who of [w.CS1, w.CS2]) {
        await expectReceived(k, who, [
          {
            occurrence: {
              to: "occasionStewards",
              occasionId: w.C.id,
              matter: { kind: "participation_changed", placeId: w.P.id },
            },
            delivery: "direct",
          },
        ]);
      }
      await expectNothing(k, w.S1, w.S2);
    });
    it("deliverNotifications#55 地域 R の地域運営者が、イベント C の関連づけを解除した / occasion.region_link_detached を消費する", async () => {
      const k = notificationKit();
      const w = await world(k);
      await k.consume(
        k.event(OccasionEvents.regionLinkDetached(w.C.id, w.R.id, k.tick())),
      );
      for (const who of [w.CS1, w.CS2]) {
        await expectReceived(k, who, [
          {
            occurrence: {
              to: "occasionStewards",
              occasionId: w.C.id,
              matter: { kind: "region_link_detached", regionId: w.R.id },
            },
            delivery: "direct",
          },
        ]);
      }
      await expectNothing(k, w.RS1, w.RS2);
    });
    it("deliverNotifications#56 イベント運営者が不在のイベント CV / イベント CV の occasion.participation_dissolved（withdrawn）、occasion.participation_changed（place）、occasion.region_link_detached、occasion.suspended、occasion.unsuspended、content.photos_taken_down（owner はイベント CV）をそれぞれ消費する", async () => {
      const k = notificationKit();
      const w = await world(k);
      await expectProxied(k, w, w.CV, [
        [
          k.event(
            OccasionEvents.participationDissolved(
              w.CV.id,
              w.P.id,
              "withdrawn",
              k.tick(),
            ),
          ),
          w.CV,
        ],
        [
          k.event(
            OccasionEvents.participationChanged(
              w.CV.id,
              w.P.id,
              "place",
              k.tick(),
            ),
          ),
          w.CV,
        ],
        [
          k.event(OccasionEvents.regionLinkDetached(w.CV.id, w.R.id, k.tick())),
          w.CV,
        ],
        [k.event(OccasionEvents.suspended(w.CV.id, k.tick())), w.CV],
        [k.event(OccasionEvents.unsuspended(w.CV.id, k.tick())), w.CV],
        [photosTakenDown(k, w.CV, false), w.CV],
      ]);
      await expectNothing(k, w.CS1, w.S1, w.RS1);
    });
  });

  describe("対象を管理する人宛て（P-93〜P-96 の、運営による非公開とその解除、申立てによる写真の削除）", () => {
    it("deliverNotifications#57 店舗 P が運営による非公開になり、その後に解除された。店舗 P とその掲載を紹介する公開中の読みものはない / place.suspended、place.unsuspended をそれぞれ消費する", async () => {
      const k = notificationKit();
      const w = await world(k);
      await k.consume(placeSuspended(k, w.P));
      await k.consume(k.event(PlaceEvents.unsuspended(w.P.id, k.tick())));
      for (const who of [w.S1, w.S2]) {
        const notes = await expectReceived(k, who, [
          { occurrence: suspendedOf(w.P, "suspended"), delivery: "direct" },
          { occurrence: suspendedOf(w.P, "unsuspended"), delivery: "direct" },
        ]);
        for (const note of notes) {
          expect(Occurrence.pointedContent(note.occurrence)).toEqual(w.P);
        }
      }
      await expectNothing(k, w.E1, w.O1);
    });
    it("deliverNotifications#58 掲載 L が運営による非公開になり、その後に解除された。掲載 L を紹介する公開中の読みものはない / listing.suspended、listing.unsuspended をそれぞれ消費する", async () => {
      const k = notificationKit();
      const w = await world(k);
      const L = await k.listing(w.P, { name: "掲載L" });
      await k.consume(k.event(ListingEvents.suspended(L.id, w.P.id, k.tick())));
      await k.consume(
        k.event(ListingEvents.unsuspended(L.id, w.P.id, k.tick())),
      );
      for (const who of [w.S1, w.S2]) {
        const notes = await expectReceived(k, who, [
          {
            occurrence: listingMatter(L, w.P, "suspended"),
            delivery: "direct",
          },
          {
            occurrence: listingMatter(L, w.P, "unsuspended"),
            delivery: "direct",
          },
        ]);
        for (const note of notes) {
          expect(Occurrence.pointedContent(note.occurrence)).toEqual(L);
        }
      }
      await expectNothing(k, w.E1, w.O1);
    });
    it("deliverNotifications#59 地域 R が運営による非公開になり、その後に解除された。地域 R を紹介する公開中の読みものはない / region.suspended、region.unsuspended をそれぞれ消費する", async () => {
      const k = notificationKit();
      const w = await world(k);
      await k.consume(k.event(RegionEvents.suspended(w.R.id, k.tick())));
      await k.consume(k.event(RegionEvents.unsuspended(w.R.id, k.tick())));
      for (const who of [w.RS1, w.RS2]) {
        const notes = await expectReceived(k, who, [
          { occurrence: contentMatterOf(w.R, "suspended"), delivery: "direct" },
          {
            occurrence: contentMatterOf(w.R, "unsuspended"),
            delivery: "direct",
          },
        ]);
        for (const note of notes) {
          expect(Occurrence.pointedContent(note.occurrence)).toEqual(w.R);
        }
      }
      await expectNothing(k, w.E1, w.O1);
    });
    it("deliverNotifications#60 イベント C が運営による非公開になり、その後に解除された。イベント C を紹介する公開中の読みものはない / occasion.suspended、occasion.unsuspended をそれぞれ消費する", async () => {
      const k = notificationKit();
      const w = await world(k);
      await k.consume(k.event(OccasionEvents.suspended(w.C.id, k.tick())));
      await k.consume(k.event(OccasionEvents.unsuspended(w.C.id, k.tick())));
      for (const who of [w.CS1, w.CS2]) {
        const notes = await expectReceived(k, who, [
          { occurrence: contentMatterOf(w.C, "suspended"), delivery: "direct" },
          {
            occurrence: contentMatterOf(w.C, "unsuspended"),
            delivery: "direct",
          },
        ]);
        for (const note of notes) {
          expect(Occurrence.pointedContent(note.occurrence)).toEqual(w.C);
        }
      }
      await expectNothing(k, w.E1, w.O1);
    });
    it("deliverNotifications#61 申立てに基づいて、店舗 P の写真が削除された / content.photos_taken_down（owner は店舗 P、unpublished: false）を消費する", async () => {
      const k = notificationKit();
      const w = await world(k);
      await k.consume(photosTakenDown(k, w.P, false));
      for (const who of [w.S1, w.S2]) {
        const [note] = await expectReceived(k, who, [
          {
            occurrence: suspendedOf(w.P, "photos_taken_down"),
            delivery: "direct",
          },
        ]);
        if (note === undefined) throw new Error("missing");
        expect(Occurrence.pointedContent(note.occurrence)).toEqual(w.P);
      }
    });
    it("deliverNotifications#62 申立てに基づいて、掲載 L の最後の写真が削除され、掲載 L が一時非公開になった / content.photos_taken_down（owner は掲載 L、unpublished: true）を消費する", async () => {
      const k = notificationKit();
      const w = await world(k);
      const L = await k.listing(w.P, { name: "掲載L" });
      await k.consume(photosTakenDown(k, L, true));
      for (const who of [w.S1, w.S2]) {
        const [note] = await expectReceived(k, who, [
          {
            occurrence: listingMatter(L, w.P, "photos_taken_down"),
            delivery: "direct",
          },
        ]);
        if (note === undefined) throw new Error("missing");
        expect(note.occurrence).toEqual(
          listingMatter(L, w.P, "photos_taken_down"),
        );
        expect(Occurrence.pointedContent(note.occurrence)).toEqual(L);
      }
      await expectNothing(k, w.E1, w.E2);
    });
    it("deliverNotifications#63 申立てに基づいて、地域 R、イベント C の写真が削除された / content.photos_taken_down（owner は地域 R）、（owner はイベント C）をそれぞれ消費する", async () => {
      const k = notificationKit();
      const w = await world(k);
      await k.consume(photosTakenDown(k, w.R, false));
      await k.consume(photosTakenDown(k, w.C, false));
      const matter = { kind: "photos_taken_down" };
      for (const who of [w.RS1, w.RS2]) {
        await expectReceived(k, who, [
          {
            occurrence: { to: "contentManagers", content: w.R, matter },
            delivery: "direct",
          },
        ]);
      }
      for (const who of [w.CS1, w.CS2]) {
        await expectReceived(k, who, [
          {
            occurrence: { to: "contentManagers", content: w.C, matter },
            delivery: "direct",
          },
        ]);
      }
    });
    it("deliverNotifications#64 申立てに基づいて、読みもの A の写真が削除された / content.photos_taken_down（owner は読みもの A）を消費する", async () => {
      const k = notificationKit();
      const w = await world(k);
      const A = {
        kind: "article",
        id: ArticleId.create(k.t.idGenerator.next()),
      } as const;
      await k.consume(photosTakenDown(k, A, false));
      for (const who of [w.E1, w.E2]) {
        const [note] = await expectReceived(k, who, [
          {
            occurrence: {
              to: "contentManagers",
              content: A,
              matter: { kind: "photos_taken_down" },
            },
            delivery: "direct",
          },
        ]);
        if (note === undefined) throw new Error("missing");
        expect(Occurrence.pointedContent(note.occurrence)).toEqual(A);
      }
      await expectNothing(k, w.O1, w.S1);
    });
  });

  describe("編集担当者宛て（P-96）", () => {
    // S5: articles and their showcases.
    it.todo(
      "deliverNotifications#65 公開中の読みもの A が掲載 L を紹介している / 掲載 L の listing.suspended、listing.unpublished、listing.deleted をそれぞれ消費する",
    );
    it.todo(
      "deliverNotifications#66 公開中の読みもの A が掲載 L を紹介している。掲載 L が期日で提供終了になった / 掲載 L の listing.offering_ended を消費する",
    );
    it.todo(
      "deliverNotifications#67 公開中の読みもの A が掲載 L を紹介している。店舗管理者が掲載 L を提供終了にした / 掲載 L の listing.offering_ended を消費する",
    );
    it.todo(
      "deliverNotifications#68 公開中の読みもの A が掲載 L を紹介している。掲載 L の提供終了を、2つのジョブが同じ observedOn で重ねて確かめた / 掲載 L の2つの listing.offering_ended（ドメインイベントの ID は別、observedOn は同じ）をそれぞれ消費する",
    );
    it.todo(
      "deliverNotifications#69 公開中の読みもの A が掲載 L を紹介している。掲載 L が提供終了になり、提供中に戻った後、別の日に再び提供終了になった / observedOn の違う2つの listing.offering_ended をそれぞれ消費する",
    );
    it.todo(
      "deliverNotifications#70 公開中の読みもの A が店舗 P と掲載 L を紹介し、公開中の読みもの B が掲載 M（店舗 P）を紹介している / 店舗 P の place.suspended を消費する",
    );
    it.todo(
      "deliverNotifications#71 公開中の読みもの A が店舗 P と掲載 L を紹介している。店舗 P が閉店になった / place.operating_status_changed（to が閉店）を消費する",
    );
    it.todo(
      "deliverNotifications#72 公開中の読みもの A が地域 R を紹介している / 地域 R の region.suspended、region.unpublished をそれぞれ消費する",
    );
    it.todo(
      "deliverNotifications#73 公開中の読みもの A がイベント C を紹介している。イベント C に参加中の店舗はない / イベント C の occasion.suspended、occasion.unpublished、occasion.cancelled、occasion.ended をそれぞれ消費する",
    );
    it.todo(
      "deliverNotifications#74 公開中の読みもの A がイベント C を紹介している。イベント C の終了を、2つのジョブが同じ observedOn で重ねて確かめた / 2つの occasion.ended をそれぞれ消費する",
    );
    it.todo(
      'deliverNotifications#75 公開中の読みもの A が掲載 L を紹介している。申立てに基づいて掲載 L の最後の写真が削除され、掲載 L が一時非公開になった / content.photos_taken_down（owner は掲載 L、unpublished: true）と、listing.unpublished（reason: "photoTakedown"）をそれぞれ消費する',
    );
    it.todo(
      "deliverNotifications#76 掲載 L を紹介する読みものが、下書きの読みものと、公開を取り下げた読みものだけ / 掲載 L の listing.deleted を消費する",
    );
    it.todo(
      "deliverNotifications#77 公開中の読みもの A が掲載 L を紹介している / 掲載 L の listing.unsuspended を消費する",
    );
    it.todo(
      "deliverNotifications#78 編集担当者が0人。公開中の読みもの A が掲載 L を紹介している / 掲載 L の listing.suspended を消費する",
    );
  });

  describe("サービス運営者宛て（P-97）", () => {
    it("deliverNotifications#79 地域 R への申請 Ap が、確認中のまま一定の期間を過ぎた / Ap の application.review_period_elapsed を消費する", async () => {
      const k = notificationKit();
      const w = await world(k);
      const Ap = k.applicationId();
      await k.consume(
        k.event(
          ApplicationEvents.reviewPeriodElapsed(
            Ap,
            new Date("2026-09-01T00:00:00.000Z"),
            k.tick(),
          ),
        ),
      );
      for (const who of [w.O1, w.O2]) {
        await expectReceived(k, who, [
          {
            occurrence: {
              to: "operators",
              matter: {
                kind: "application_review_period_elapsed",
                applicationId: Ap,
              },
            },
            delivery: "direct",
          },
        ]);
      }
      await expectNothing(k, w.RS1, w.RS2);
    });

    it("deliverNotifications#80 同じ申請 Ap の期間の超過を、2つのジョブが同じ pendingSince で重ねて確かめた / 2つの application.review_period_elapsed をそれぞれ消費する", async () => {
      const k = notificationKit();
      const w = await world(k);
      const Ap = k.applicationId();
      const since = new Date("2026-09-01T00:00:00.000Z");
      const first = k.event(
        ApplicationEvents.reviewPeriodElapsed(Ap, since, k.tick()),
      );
      const second = k.event(
        ApplicationEvents.reviewPeriodElapsed(Ap, since, k.tick()),
      );
      expect(first.id).not.toBe(second.id);
      await k.consume(first);
      await k.consume(second);
      for (const who of [w.O1, w.O2]) {
        await expectReceived(k, who, [
          { occurrence: { to: "operators" }, delivery: "direct" },
        ]);
      }
    });

    it("deliverNotifications#81 取り下げの申立て Cl が受け付けられた / takedown_claim.submitted を消費する", async () => {
      const k = notificationKit();
      const w = await world(k);
      const Cl = await k.takedownClaim(w.P);
      await k.consume(
        k.event(ModerationEvents.takedownClaimSubmitted(Cl, k.tick())),
      );
      for (const who of [w.O1, w.O2]) {
        const [note] = await expectReceived(k, who, [
          {
            occurrence: {
              to: "operators",
              matter: { kind: "takedown_claim_received", claimId: Cl },
            },
            delivery: "direct",
          },
        ]);
        if (note === undefined) throw new Error("missing");
        expect(Occurrence.pointedContent(note.occurrence)).toBeNull();
      }
      await expectNothing(k, w.S1, w.S2);
    });
    it("deliverNotifications#82 情報の誤り・閉店の連絡 Rp が受け付けられた / info_report.submitted を消費する", async () => {
      const k = notificationKit();
      const w = await world(k);
      const U = await k.person("u");
      const Rp = await k.infoReport({ kind: "place", placeId: w.P.id }, U);
      await k.consume(
        k.event(ModerationEvents.infoReportSubmitted(Rp, k.tick())),
      );
      for (const who of [w.O1, w.O2]) {
        await expectReceived(k, who, [
          {
            occurrence: {
              to: "operators",
              matter: { kind: "info_report_received", reportId: Rp },
            },
            delivery: "direct",
          },
        ]);
      }
      await expectNothing(k, w.S1, w.S2);
    });
  });

  describe("招待された利用者宛て（P-98）", () => {
    it("deliverNotifications#83 S1 が、アカウントを持つ利用者 U のメールアドレスを、店舗 P の管理メンバーに招待した / authority.invitation_issued を消費する", async () => {
      const k = notificationKit();
      const w = await world(k);
      const U = await k.person("u");
      const I = k.invitationId();
      await k.consume(
        k.event(AuthorityEvents.invitationIssued(w.P, I, U.email, k.tick())),
      );
      const [note] = await expectReceived(k, U, [
        {
          occurrence: {
            to: "invitee",
            email: U.email,
            target: w.P,
            invitationId: I,
          },
          delivery: "direct",
        },
      ]);
      if (note === undefined) throw new Error("missing");
      expect(Occurrence.pointedContent(note.occurrence)).toEqual(w.P);
      expect(k.mailsTo(U.email)[0]?.link).toEqual({
        kind: "invitation",
        target: w.P,
        invitationId: I,
      });
      await expectNothing(k, w.S1, w.S2);
    });

    it("deliverNotifications#84 S1 が、アカウントのないメールアドレスを招待した / authority.invitation_issued を消費する", async () => {
      const k = notificationKit();
      const w = await world(k);
      const address = k.unregisteredEmail("invitee");
      await k.consume(
        k.event(
          AuthorityEvents.invitationIssued(
            w.P,
            k.invitationId(),
            address,
            k.tick(),
          ),
        ),
      );
      const mails = k.mailsTo(address);
      expect(mails).toHaveLength(1);
      expect(mails[0]?.subject).toBe("[invitee] direct");
      expect(k.mailer.sent).toHaveLength(1);
      for (const who of [w.S1, w.S2, w.O1, w.O2]) {
        expect(await k.notificationsOf(who)).toEqual([]);
      }
    });

    it("deliverNotifications#85 上の消費の後 / 同じ authority.invitation_issued をもう一度消費する", async () => {
      const k = notificationKit();
      const w = await world(k);
      const address = k.unregisteredEmail("invitee");
      const e = k.event(
        AuthorityEvents.invitationIssued(
          w.P,
          k.invitationId(),
          address,
          k.tick(),
        ),
      );
      await k.consume(e);
      await expect(k.consume(e)).resolves.toBeUndefined();
      expect(k.mailsTo(address)).toHaveLength(1);
    });
  });

  describe("権限を付与された利用者宛て（P-99）と本人宛て（P-100）", () => {
    it('deliverNotifications#86 サービス運営者が、利用者 U に地域 R の管理権限を付与した / authority.steward_appointed（via: "grant"）を消費する', async () => {
      const k = notificationKit();
      const w = await world(k);
      const U = await k.person("u");
      await k.appoint(w.R, U);
      await k.consume(
        k.event(
          AuthorityEvents.stewardAppointed(w.R, U.accountId, "grant", k.tick()),
        ),
      );
      const [note] = await expectReceived(k, U, [
        {
          occurrence: {
            to: "grantee",
            granted: { kind: "stewardship", target: w.R },
          },
          delivery: "direct",
        },
      ]);
      if (note === undefined) throw new Error("missing");
      expect(Occurrence.pointedContent(note.occurrence)).toEqual(w.R);
      await expectNothing(k, w.RS1, w.RS2, w.O1);
    });

    it("deliverNotifications#87 サービス運営者が、利用者 U を編集担当者に任命した。別に、利用者 W にサービス運営者の役割を付与した / それぞれの authority.role_granted を消費する", async () => {
      const k = notificationKit();
      const w = await world(k);
      const U = await k.person("u");
      const W = await k.person("w");
      await k.editors(U);
      await k.operators(W);
      await k.consume(
        k.event(AuthorityEvents.roleGranted("editor", U.accountId, k.tick())),
      );
      await k.consume(
        k.event(AuthorityEvents.roleGranted("operator", W.accountId, k.tick())),
      );
      for (const [who, role] of [
        [U, "editor"],
        [W, "operator"],
      ] as const) {
        const [note] = await expectReceived(k, who, [
          {
            occurrence: { to: "grantee", granted: { kind: "role", role } },
            delivery: "direct",
          },
        ]);
        if (note === undefined) throw new Error("missing");
        expect(Occurrence.pointedContent(note.occurrence)).toBeNull();
      }
      await expectNothing(k, w.E1, w.E2, w.O1, w.O2);
    });

    it("deliverNotifications#88 O1 が自分自身を編集担当者に任命した / authority.role_granted を消費する", async () => {
      const k = notificationKit();
      const w = await world(k);
      await k.editors(w.O1);
      await k.consume(
        k.event(
          AuthorityEvents.roleGranted("editor", w.O1.accountId, k.tick()),
        ),
      );
      await expectReceived(k, w.O1, [
        {
          occurrence: {
            to: "grantee",
            granted: { kind: "role", role: "editor" },
          },
          delivery: "direct",
        },
      ]);
    });

    it('deliverNotifications#89 サービス運営者が、S2 の店舗 P の管理権限を解除した / authority.steward_removed（reason: "revoked"）を消費する', async () => {
      const k = notificationKit();
      const w = await world(k);
      await k.removeSteward(w.P, w.S2);
      await k.consume(
        k.event(
          AuthorityEvents.stewardRemoved(
            w.P,
            w.S2.accountId,
            "revoked",
            k.tick(),
          ),
        ),
      );
      const [note] = await expectReceived(k, w.S2, [
        {
          occurrence: {
            to: "self",
            revoked: { kind: "stewardship", target: w.P },
          },
          delivery: "direct",
        },
      ]);
      if (note === undefined) throw new Error("missing");
      expect(Occurrence.pointedContent(note.occurrence)).toEqual(w.P);
      await expectNothing(k, w.S1);
    });

    it('deliverNotifications#90 サービス運営者が、店舗 P の最後の店舗管理者 S1 の管理権限を解除し、店舗 P が店舗管理者不在になった / authority.steward_removed（reason: "revoked"）を消費する', async () => {
      const k = notificationKit();
      const w = await world(k);
      await k.removeSteward(w.P, w.S2);
      await k.removeSteward(w.P, w.S1);
      await k.consume(
        k.event(
          AuthorityEvents.stewardRemoved(
            w.P,
            w.S1.accountId,
            "revoked",
            k.tick(),
          ),
        ),
      );
      await expectReceived(k, w.S1, [
        { occurrence: { to: "self" }, delivery: "direct" },
      ]);
      await expectNothing(k, w.O1, w.O2);
    });

    it('deliverNotifications#91 サービス運営者が、E2 の編集担当者の任命を解除した。別に、O2 のサービス運営者の役割を解除した / それぞれの authority.role_revoked（reason: "revoked"）を消費する', async () => {
      const k = notificationKit();
      const w = await world(k);
      await k.consume(
        k.event(
          AuthorityEvents.roleRevoked(
            "editor",
            w.E2.accountId,
            "revoked",
            k.tick(),
          ),
        ),
      );
      await k.consume(
        k.event(
          AuthorityEvents.roleRevoked(
            "operator",
            w.O2.accountId,
            "revoked",
            k.tick(),
          ),
        ),
      );
      for (const [who, role] of [
        [w.E2, "editor"],
        [w.O2, "operator"],
      ] as const) {
        const [note] = await expectReceived(k, who, [
          {
            occurrence: { to: "self", revoked: { kind: "role", role } },
            delivery: "direct",
          },
        ]);
        if (note === undefined) throw new Error("missing");
        expect(Occurrence.pointedContent(note.occurrence)).toBeNull();
      }
      await expectNothing(k, w.E1, w.O1);
    });
  });
});

/**
 * What the rows leave implicit: a takedown on a listing that is gone, the
 * editors' events while no article is published (stage 5), and the names
 * a mail's labels carry.
 */
describe("deliverNotifications (content matters)", () => {
  it("announces no photo takedown of a listing that no longer exists", async () => {
    const k = notificationKit();
    const w = await world(k);
    const gone = {
      kind: "listing",
      id: ListingId.create(k.t.idGenerator.next()),
    } as const;
    await expect(
      k.consume(photosTakenDown(k, gone, true)),
    ).resolves.toBeUndefined();
    expect(k.mailer.sent).toEqual([]);
    await expectNothing(k, w.S1, w.O1);
  });

  it("announces no editors' change while no article is published (stage 5)", async () => {
    const k = notificationKit();
    const w = await world(k);
    const L = await k.listing(w.P);
    for (const e of [
      k.event(ListingEvents.unpublished(L.id, "byManager", k.tick())),
      k.event(ListingEvents.deleted(L.id, k.tick())),
      k.event(
        ListingEvents.offeringEnded(
          L.id,
          LocalDate.parse("2026-09-28"),
          k.tick(),
        ),
      ),
      k.event(
        PlaceEvents.operatingStatusChanged(
          w.P.id,
          "open",
          "permanentlyClosed",
          k.tick(),
        ),
      ),
      k.event(RegionEvents.unpublished(w.R.id, "byManager", k.tick())),
      k.event(OccasionEvents.unpublished(w.C.id, "byManager", k.tick())),
      k.event(
        OccasionEvents.ended(w.C.id, LocalDate.parse("2026-10-04"), k.tick()),
      ),
    ]) {
      await expect(k.consume(e)).resolves.toBeUndefined();
    }
    expect(k.mailer.sent).toEqual([]);
    await expectNothing(k, w.E1, w.E2, w.S1, w.RS1, w.CS1);
  });

  it("names the listing and the report's target in the mail's labels", async () => {
    const k = notificationKit();
    const w = await world(k);
    const U = await k.person("u");
    const L = await k.listing(w.P, { name: "掲載L" });
    const target = {
      kind: "listing",
      placeId: w.P.id,
      listingId: L.id,
    } as const;
    const Rp = await k.infoReport(target, U);
    await k.consume(k.event(ListingEvents.suspended(L.id, w.P.id, k.tick())));
    await k.consume(
      k.event(ModerationEvents.infoReportSubmitted(Rp, k.tick())),
    );
    const [suspended] = k.mailsTo(w.S1);
    expect(suspended?.body).toContain(`listing:${L.id}="掲載L"`);
    expect(suspended?.body).toContain(`place:${w.P.id}="店舗P"`);
    const [received] = k.mailsTo(w.O1);
    expect(received?.body).toContain(`infoReport:${Rp}="掲載L"`);
  });
});

describe("deliverNotifications (participating places)", () => {
  it("announces an occasion's cancellation to every participating place, beyond one page", async () => {
    const k = notificationKit();
    const w = await world(k);
    const places = Array.from({ length: 101 }, (_, i) => k.place(`店舗${i}`));
    await k.participate(w.C, ...places);
    const planned = await planAnnouncements(
      k.container,
      k.event(OccasionEvents.cancelled(w.C.id, k.tick())),
    );
    expect(
      new Set(
        planned.map((p) =>
          p.delivered.occurrence.to === "placeStewards"
            ? p.delivered.occurrence.placeId
            : null,
        ),
      ),
    ).toEqual(new Set(places.map((p) => p.id)));
    expect(planned).toHaveLength(101);
  });
});

describe("deliverNotifications mechanisms (stage-1 events)", () => {
  async function stewardAdded(k: Kit) {
    const w = await world(k);
    const S3 = await k.person("s3");
    await k.appoint(w.P, S3);
    const e = k.event(
      AuthorityEvents.stewardAppointed(
        w.P,
        S3.accountId,
        "application",
        k.tick(),
      ),
    );
    return { ...w, S3, e };
  }

  it("records and mails an application event with its reference, emitting no event", async () => {
    const k = notificationKit();
    await world(k);
    const U = await k.person("u");
    const Ap = k.applicationId();
    const before = await k.storedEventCount();
    const at = k.clock.now();
    await k.consume(k.event(ApplicationEvents.returned(Ap, individual(U), at)));
    const [note] = await expectReceived(k, U, [
      {
        occurrence: {
          to: "applicant",
          applicant: { kind: "individual" },
          applicationId: Ap,
          matter: "returned",
        },
        delivery: "direct",
      },
    ]);
    expect(note?.createdAt).toEqual(k.clock.now());
    expect(k.mailsTo(U)[0]?.body).toContain(`application:${Ap}=null`);
    expect(await k.storedEventCount()).toBe(before);
  });

  it("keeps the notifications when every mail fails, and sends each once on redelivery", async () => {
    const k = notificationKit();
    const w = await stewardAdded(k);
    k.mailer.failWhen(() => true);
    await k.consumeFailing(w.e);
    for (const who of [w.S1, w.S2]) {
      expect(await k.notificationsOf(who)).toHaveLength(1);
      expect(k.mailsTo(who)).toEqual([]);
    }
    k.mailer.failWhen(null);
    await k.consume(w.e);
    for (const who of [w.S1, w.S2]) {
      expect(await k.notificationsOf(who)).toHaveLength(1);
      expect(k.mailsTo(who)).toHaveLength(1);
    }
  });

  it("mails the others when one send fails, and only the missing one on redelivery", async () => {
    const k = notificationKit();
    const w = await stewardAdded(k);
    k.mailer.failWhen((mail) => mail.to === w.S1.email);
    await k.consumeFailing(w.e);
    expect(k.mailsTo(w.S1)).toEqual([]);
    expect(k.mailsTo(w.S2)).toHaveLength(1);
    expect(await k.notificationsOf(w.S1)).toHaveLength(1);
    k.mailer.failWhen(null);
    await k.consume(w.e);
    expect(k.mailsTo(w.S1)).toHaveLength(1);
    expect(k.mailsTo(w.S2)).toHaveLength(1);
  });

  it("re-addresses at redelivery: new stewards get both, former ones keep the notification without the mail", async () => {
    const k = notificationKit();
    const w = await stewardAdded(k);
    k.mailer.failWhen(() => true);
    await k.consumeFailing(w.e);
    k.mailer.failWhen(null);
    const S4 = await k.person("s4");
    await k.removeSteward(w.P, w.S2);
    await k.appoint(w.P, S4);
    await k.consume(w.e);
    expect(k.mailsTo(w.S1)).toHaveLength(1);
    expect(k.mailsTo(S4)).toHaveLength(1);
    expect(await k.notificationsOf(S4)).toHaveLength(1);
    expect(await k.notificationsOf(w.S2)).toHaveLength(1);
    expect(k.mailsTo(w.S2)).toEqual([]);
  });

  it("leaves out a recipient that withdrew before the consumption", async () => {
    const k = notificationKit();
    const w = await stewardAdded(k);
    await k.withdraw(w.S2);
    await k.consume(w.e);
    expect(await k.notificationsOf(w.S1)).toHaveLength(1);
    expect(k.mailsTo(w.S1)).toHaveLength(1);
    await expectNothing(k, w.S2);
  });

  it("addresses nobody while no operator exists (proxy and operators audiences)", async () => {
    const k = notificationKit();
    const V = k.place("店舗V");
    await k.consume(
      k.event(
        ApplicationEvents.lapsed(k.applicationId(), asPlace(V), k.tick()),
      ),
    );
    await k.consume(
      k.event(
        ApplicationEvents.reviewPeriodElapsed(
          k.applicationId(),
          new Date("2026-09-01T00:00:00.000Z"),
          k.tick(),
        ),
      ),
    );
    expect(k.mailer.sent).toEqual([]);
  });

  it("does not duplicate on redelivery of a stewards' announcement", async () => {
    const k = notificationKit();
    const w = await stewardAdded(k);
    await k.consume(w.e);
    await k.consume(w.e);
    for (const who of [w.S1, w.S2]) {
      expect(await k.notificationsOf(who)).toHaveLength(1);
      expect(k.mailsTo(who)).toHaveLength(1);
    }
  });
});
