import { EmailAddress } from "@repo/core/domain/common/emailAddress";
import { EventId } from "@repo/core/domain/common/event";
import { PhotoId } from "@repo/core/domain/common/ids";
import type { ContentRef } from "@repo/core/domain/common/refs";
import {
  type ResolvedTakedownClaim,
  TakedownClaim,
} from "@repo/core/domain/moderation/takedownClaim";
import type { TakedownOutcome } from "@repo/core/domain/moderation/takedownOutcome";
import type { Origin } from "@repo/core/domain/notification/announcement";
import type { DeliveredOccurrence } from "@repo/core/domain/notification/delivery";
import { NotificationDestination } from "@repo/core/domain/notification/destination";
import {
  NotificationMail,
  type RefLabel,
  TakedownOutcomeMail,
} from "@repo/core/domain/notification/mail";
import { Occurrence } from "@repo/core/domain/notification/occurrence";
import type { NotificationMailRenderer } from "@repo/core/domain/notification/ports/notificationMailRenderer";
import {
  AUDIENCES,
  notificationIds,
  sampleOccurrences,
} from "@repo/core/domain/notification/testing/samples";
import { describe, expect, it } from "vitest";

export type NotificationMailRendererHarness = Readonly<{
  renderer: NotificationMailRenderer;
  /** The implementation's own destination → URL mapping. */
  urlOf: (destination: NotificationDestination) => string;
}>;

const M1 = EmailAddress.create("m1@example.com");
const origin: Origin = {
  by: "event",
  eventId: EventId.create("renderer-conformance"),
};

/**
 * Labels naming every reference of `delivered` (`name` or `null`). An
 * application reads as a listing application about a listing and its
 * place, each named by `name`.
 */
function labelsFor(
  delivered: DeliveredOccurrence,
  name: (ref: Readonly<{ kind: string; id: string }>) => string | null,
): readonly RefLabel[] {
  return Occurrence.refsOf(delivered.occurrence).map(
    (ref): RefLabel =>
      ref.kind === "application"
        ? {
            ref,
            label: {
              applicationKind: "listing",
              subjects: [
                { kind: "listing", name: name(ref) },
                { kind: "place", name: name(ref) },
              ],
            },
          }
        : { ref, label: name(ref) },
  );
}

const mailOf = (
  delivered: DeliveredOccurrence,
  labels: readonly RefLabel[] = labelsFor(
    delivered,
    (ref) => `名称-${ref.id.slice(-4)}`,
  ),
) => NotificationMail.compose(origin, delivered, M1, labels);

const outcomeOf = (text: string) => text as TakedownOutcome;

/** `spec/testcases/ports/notificationMailRenderer.md`. */
export function describeNotificationMailRendererContract(
  name: string,
  makeHarness: () => NotificationMailRendererHarness,
): void {
  const ids = notificationIds(0x40_0000);
  const P = ids.place();
  const V = ids.place();
  const L = ids.listing();
  const LV = ids.listing();
  const C = ids.occasion();
  const CV = ids.occasion();
  const Ap = ids.application();
  const Rp = ids.report();
  const S3 = ids.account();
  const I = ids.invitation();

  /** Renders and checks the link is the destination, and its URL is in the body. */
  const expectLink = (
    h: NotificationMailRendererHarness,
    delivered: DeliveredOccurrence,
    expected: NotificationDestination | null,
  ) => {
    const mail = mailOf(delivered);
    const rendered = h.renderer.render(mail);
    expect(rendered.link).toEqual(expected);
    expect(rendered.link).toEqual(NotificationDestination.of(mail));
    if (expected !== null) expect(rendered.body).toContain(h.urlOf(expected));
    return rendered;
  };

  describe(`NotificationMailRenderer contract (${name})`, () => {
    describe("render", () => {
      it("notificationMailRenderer#1 宛先 M1 の direct の NotificationMail / render を呼ぶ", () => {
        const h = makeHarness();
        const rendered = h.renderer.render(
          mailOf({
            occurrence: {
              to: "grantee",
              granted: { kind: "role", role: "editor" },
            },
            delivery: "direct",
          }),
        );
        expect(rendered.to).toBe(M1);
        expect(rendered.subject.length).toBeGreaterThan(0);
        expect(rendered.body.length).toBeGreaterThan(0);
      });

      it("notificationMailRenderer#2 Occurrence の宛先の立場（applicant、approver、placeStewards、regionStewards、occasionStewards、contentManagers、editors、operators、invitee、grantee、self）ごとの NotificationMail / それぞれ render を呼ぶ", () => {
        const h = makeHarness();
        const { samples } = sampleOccurrences(notificationIds(0x41_0000));
        expect(new Set(samples.map((s) => s.delivered.occurrence.to))).toEqual(
          new Set(AUDIENCES),
        );
        for (const { name: sample, delivered } of samples) {
          const mail = mailOf(delivered);
          const rendered = h.renderer.render(mail);
          expect(rendered.to, sample).toBe(M1);
          expect(rendered.subject.length, sample).toBeGreaterThan(0);
          expect(rendered.link, sample).toEqual(
            NotificationDestination.of(mail),
          );
          if (rendered.link !== null) {
            expect(rendered.body, sample).toContain(h.urlOf(rendered.link));
          }
        }
      });

      it("notificationMailRenderer#3 同じ NotificationMail / render を2回呼ぶ", () => {
        const h = makeHarness();
        for (const { delivered } of sampleOccurrences(
          notificationIds(0x42_0000),
        ).samples) {
          const mail = mailOf(delivered);
          expect(h.renderer.render(mail)).toEqual(h.renderer.render(mail));
        }
      });

      it("notificationMailRenderer#4 labels に、名称が null の参照を持つ NotificationMail / render を呼ぶ", () => {
        const h = makeHarness();
        for (const { delivered } of sampleOccurrences(
          notificationIds(0x43_0000),
        ).samples) {
          const rendered = h.renderer.render(
            mailOf(
              delivered,
              labelsFor(delivered, () => null),
            ),
          );
          expect(rendered.to).toBe(M1);
          expect(rendered.body.length).toBeGreaterThan(0);
        }
      });

      it("notificationMailRenderer#5 placeStewards / categories_reassigned の NotificationMail / render を呼ぶ", () => {
        const h = makeHarness();
        const retired = "廃止したカテゴリー";
        const delivered: DeliveredOccurrence = {
          occurrence: {
            to: "placeStewards",
            placeId: P,
            subject: {
              kind: "place",
              matter: {
                kind: "categories_reassigned",
                retiredCategoryId: ids.category(),
              },
            },
          },
          delivery: "direct",
        };
        const rendered = h.renderer.render(
          mailOf(
            delivered,
            labelsFor(delivered, (ref) =>
              ref.kind === "category" ? retired : "店舗名",
            ),
          ),
        );
        // No successor can be mentioned: neither the occurrence nor
        // `NotificationMail` has a field that could carry one. What is
        // observable is that the category the mail names is the retired one.
        expect(rendered.body).toContain(retired);
        expect(rendered.link).toEqual({
          kind: "placeManagement",
          placeId: P,
          facet: "listings",
        });
      });
    });

    describe("行き先", () => {
      it("notificationMailRenderer#6 direct の、contentManagers / 掲載 L の suspended の NotificationMail / render を呼ぶ", () => {
        expectLink(
          makeHarness(),
          {
            occurrence: {
              to: "contentManagers",
              content: { kind: "listing", id: L },
              placeId: P,
              matter: { kind: "suspended" },
            },
            delivery: "direct",
          },
          { kind: "listingManagement", listingId: L },
        );
      });

      it("notificationMailRenderer#7 proxy の、contentManagers / 掲載 LV の suspended の NotificationMail / render を呼ぶ", () => {
        expectLink(
          makeHarness(),
          {
            occurrence: {
              to: "contentManagers",
              content: { kind: "listing", id: LV },
              placeId: V,
              matter: { kind: "suspended" },
            },
            delivery: "proxy",
          },
          {
            kind: "proxyOperation",
            target: { kind: "place", id: V },
            direct: { kind: "listingManagement", listingId: LV },
          },
        );
      });

      it("notificationMailRenderer#8 direct の、applicant / returned（個人として行った申請 Ap）の NotificationMail / render を呼ぶ", () => {
        expectLink(
          makeHarness(),
          {
            occurrence: {
              to: "applicant",
              applicant: { kind: "individual" },
              applicationId: Ap,
              matter: "returned",
            },
            delivery: "direct",
          },
          { kind: "ownApplication", applicationId: Ap },
        );
      });

      it("notificationMailRenderer#9 proxy の、applicant / lapsed（店舗 V の店舗管理者として行った申請 Ap）の NotificationMail / render を呼ぶ", () => {
        expectLink(
          makeHarness(),
          {
            occurrence: {
              to: "applicant",
              applicant: { kind: "place", placeId: V },
              applicationId: Ap,
              matter: "lapsed",
            },
            delivery: "proxy",
          },
          {
            kind: "proxyOperation",
            target: { kind: "place", id: V },
            direct: { kind: "ownApplication", applicationId: Ap },
          },
        );
      });

      it("notificationMailRenderer#10 proxy の、contentManagers / 店舗 V の photos_taken_down の NotificationMail / render を呼ぶ", () => {
        expectLink(
          makeHarness(),
          {
            occurrence: {
              to: "contentManagers",
              content: { kind: "place", id: V },
              matter: { kind: "photos_taken_down" },
            },
            delivery: "proxy",
          },
          {
            kind: "proxyOperation",
            target: { kind: "place", id: V },
            direct: { kind: "placeManagement", placeId: V, facet: "profile" },
          },
        );
      });

      it("notificationMailRenderer#11 proxy の、placeStewards / 店舗 V の confirmation_requested（連絡 Rp）の NotificationMail / render を呼ぶ", () => {
        expectLink(
          makeHarness(),
          {
            occurrence: {
              to: "placeStewards",
              placeId: V,
              subject: {
                kind: "place",
                matter: { kind: "confirmation_requested", reportId: Rp },
              },
            },
            delivery: "proxy",
          },
          {
            kind: "proxyOperation",
            target: { kind: "place", id: V },
            direct: { kind: "confirmationRequest", reportId: Rp },
          },
        );
      });

      it("notificationMailRenderer#12 proxy の、placeStewards / 店舗 V の steward_added（就任した人 S3）の NotificationMail / render を呼ぶ", () => {
        expectLink(
          makeHarness(),
          {
            occurrence: {
              to: "placeStewards",
              placeId: V,
              subject: {
                kind: "place",
                matter: { kind: "steward_added", appointee: S3 },
              },
            },
            delivery: "proxy",
          },
          {
            kind: "proxyOperation",
            target: { kind: "place", id: V },
            direct: { kind: "placeManagement", placeId: V, facet: "members" },
          },
        );
      });

      it("notificationMailRenderer#13 proxy の、occasionStewards / イベント CV の participation_withdrawn（店舗 P）の NotificationMail / render を呼ぶ", () => {
        expectLink(
          makeHarness(),
          {
            occurrence: {
              to: "occasionStewards",
              occasionId: CV,
              matter: { kind: "participation_withdrawn", placeId: P },
            },
            delivery: "proxy",
          },
          {
            kind: "proxyOperation",
            target: { kind: "occasion", id: CV },
            direct: { kind: "occasionParticipant", occasionId: CV, placeId: P },
          },
        );
      });

      it("notificationMailRenderer#14 proxy の、approver / submitted（申請 Ap）の NotificationMail / render を呼ぶ", () => {
        expectLink(
          makeHarness(),
          {
            occurrence: {
              to: "approver",
              approver: {
                kind: "steward",
                target: { kind: "occasion", id: CV },
              },
              applicationId: Ap,
              matter: "submitted",
            },
            delivery: "proxy",
          },
          { kind: "applicationReview", applicationId: Ap },
        );
      });

      it("notificationMailRenderer#15 direct の、placeStewards / 店舗 P の occasion_cancelled（イベント C）の NotificationMail / render を呼ぶ", () => {
        expectLink(
          makeHarness(),
          {
            occurrence: {
              to: "placeStewards",
              placeId: P,
              subject: {
                kind: "place",
                matter: { kind: "occasion_cancelled", occasionId: C },
              },
            },
            delivery: "direct",
          },
          { kind: "participationEditing", placeId: P, occasionId: C },
        );
      });

      it("notificationMailRenderer#16 direct の、occasionStewards / イベント C の participation_withdrawn（店舗 P）の NotificationMail / render を呼ぶ", () => {
        expectLink(
          makeHarness(),
          {
            occurrence: {
              to: "occasionStewards",
              occasionId: C,
              matter: { kind: "participation_withdrawn", placeId: P },
            },
            delivery: "direct",
          },
          { kind: "occasionParticipant", occasionId: C, placeId: P },
        );
      });

      it("notificationMailRenderer#17 invitee（店舗 P への招待 I）の NotificationMail / render を呼ぶ", () => {
        expectLink(
          makeHarness(),
          {
            occurrence: {
              to: "invitee",
              email: M1,
              target: { kind: "place", id: P },
              invitationId: I,
            },
            delivery: "direct",
          },
          {
            kind: "invitation",
            target: { kind: "place", id: P },
            invitationId: I,
          },
        );
      });

      it("notificationMailRenderer#18 self の NotificationMail / render を呼ぶ", () => {
        const h = makeHarness();
        const R = ids.region();
        const facets = [
          "overview",
          "profile",
          "listings",
          "affiliations",
          "participations",
          "members",
        ] as const;
        // Where each revoked authority would have opened, had it been
        // granted: none of them may appear in the body.
        const cases: readonly Readonly<{
          revoked: Extract<
            DeliveredOccurrence["occurrence"],
            { to: "self" }
          >["revoked"];
          forbidden: readonly NotificationDestination[];
        }>[] = [
          {
            revoked: { kind: "stewardship", target: { kind: "place", id: P } },
            forbidden: facets.map((facet) => ({
              kind: "placeManagement",
              placeId: P,
              facet,
            })),
          },
          {
            revoked: { kind: "stewardship", target: { kind: "region", id: R } },
            forbidden: [
              {
                kind: "grantedAuthority",
                granted: {
                  kind: "stewardship",
                  target: { kind: "region", id: R },
                },
              },
              { kind: "regionManagement", regionId: R, facet: "content" },
              { kind: "regionManagement", regionId: R, facet: "occasionLinks" },
            ],
          },
          {
            revoked: { kind: "role", role: "editor" },
            forbidden: [
              {
                kind: "grantedAuthority",
                granted: { kind: "role", role: "editor" },
              },
            ],
          },
        ];
        for (const { revoked, forbidden } of cases) {
          const rendered = expectLink(
            h,
            { occurrence: { to: "self", revoked }, delivery: "direct" },
            null,
          );
          for (const destination of forbidden) {
            expect(rendered.body).not.toContain(h.urlOf(destination));
          }
        }
      });
    });

    describe("renderTakedownOutcome", () => {
      const receivedAt = new Date("2026-09-20T03:00:00.000Z");
      const outcome = outcomeOf(
        "申し立てのあった写真2枚を削除しました。\n残りの写真は、権利者の確認がとれたため公開を続けます。",
      );
      const claim = (
        target: ContentRef,
        text: string = outcome,
      ): ResolvedTakedownClaim => {
        const photoId = PhotoId.create(`photo-${ids.claim()}`);
        const open = TakedownClaim.submit(
          {
            id: ids.claim(),
            standing: "photoRightsHolder",
            target,
            photoIds: [photoId],
            reason: "権利を侵害しています",
            email: M1,
          },
          { viewable: true, photoIds: [photoId] },
          receivedAt,
        ).entity;
        return TakedownClaim.resolve(open, text, receivedAt).entity;
      };

      it("notificationMailRenderer#19 宛先 M1、対象が掲載・店舗・地域・イベント・読みもののそれぞれの TakedownOutcomeMail / それぞれ renderTakedownOutcome を呼ぶ", () => {
        const h = makeHarness();
        const targets: readonly ContentRef[] = [
          { kind: "listing", id: L },
          { kind: "place", id: P },
          { kind: "region", id: ids.region() },
          { kind: "occasion", id: C },
          { kind: "article", id: ids.article() },
        ];
        for (const target of targets) {
          const rendered = h.renderer.renderTakedownOutcome(
            TakedownOutcomeMail.compose(claim(target), "対象の名称"),
          );
          expect(rendered.to).toBe(M1);
          expect(rendered.link).toBeNull();
          expect(rendered.subject.length).toBeGreaterThan(0);
          expect(rendered.body).toContain(outcome);
        }
      });

      it("notificationMailRenderer#20 措置を行わないことを outcome にした TakedownOutcomeMail / renderTakedownOutcome を呼ぶ", () => {
        const h = makeHarness();
        const none = outcomeOf(
          "確認の結果、申し立てのあった写真は権利を侵害していないと判断し、削除などの措置は行いません。",
        );
        const rendered = h.renderer.renderTakedownOutcome(
          TakedownOutcomeMail.compose(
            claim({ kind: "place", id: P }, none),
            "店舗",
          ),
        );
        expect(rendered.body).toContain(none);
      });

      it("notificationMailRenderer#21 対象の名称が null の TakedownOutcomeMail / renderTakedownOutcome を呼ぶ", () => {
        const h = makeHarness();
        const rendered = h.renderer.renderTakedownOutcome(
          TakedownOutcomeMail.compose(claim({ kind: "listing", id: LV }), null),
        );
        expect(rendered.to).toBe(M1);
        expect(rendered.body).toContain(outcome);
      });

      it("notificationMailRenderer#22 同じ TakedownOutcomeMail / renderTakedownOutcome を2回呼ぶ", () => {
        const h = makeHarness();
        const mail = TakedownOutcomeMail.compose(
          claim({ kind: "region", id: ids.region() }),
          "地域",
        );
        expect(h.renderer.renderTakedownOutcome(mail)).toEqual(
          h.renderer.renderTakedownOutcome(mail),
        );
      });
    });
  });
}
