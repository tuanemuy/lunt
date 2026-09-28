import type {
  ApplicationContentView,
  ListingPhotoView,
} from "@repo/core/application/application/detail";
import type { SubjectView } from "@repo/core/application/application/views";
import { StewardshipClaim } from "@repo/core/domain/application/stewardshipClaim";
import {
  RejectionReason,
  ReturnReply,
  ReturnRequest,
} from "@repo/core/domain/application/texts";
import { EmailAddress } from "@repo/core/domain/common/emailAddress";
import { PhotoId } from "@repo/core/domain/common/ids";
import {
  ListingDescription,
  ListingName,
} from "@repo/core/domain/listing/values";
import { notificationIds } from "@repo/core/domain/notification/testing/samples";
import { describe, expect, it } from "vitest";
import {
  applyPath,
  contentData,
  statusData,
  subjectItems,
} from "../applicationContentData";
import {
  applicantText,
  reviewerApplicantText,
  subjectTitle,
} from "../applicationSubjects";

const ids = notificationIds();
const photoId = () => PhotoId.create(ids.account());

const photo = (id: PhotoId): ListingPhotoView => ({
  photoId: id,
  display: { url: `/photos/${id}` },
  framing: null,
});

describe("application subjects", () => {
  const place = ids.place();
  const listing = ids.listing();
  const subjects: readonly SubjectView[] = [
    {
      ref: { kind: "place", id: place },
      name: "谷中ベーカリー",
      notYet: false,
    },
    {
      ref: { kind: "listing", id: listing },
      name: "くるみパン",
      notYet: false,
    },
  ];

  it("titles a listing revision by its listing and store", () => {
    expect(subjectTitle(subjects)).toBe("くるみパン（谷中ベーカリー）");
  });

  it("names a deleted listing without a name and offers no link to what is not yet", () => {
    const items = subjectItems([
      { ref: { kind: "listing", id: listing }, name: null, notYet: false },
      { ref: { kind: "place", id: place }, name: "新しい店", notYet: true },
    ]);
    expect(items).toEqual([
      {
        label: "掲載",
        name: "（なくなった掲載）",
        href: `/listings/${listing}`,
        note: null,
      },
      {
        label: "店舗",
        name: "新しい店",
        href: null,
        note: "店舗はまだありません。登録が承認されると、店舗ができます。",
      },
    ]);
  });

  it("shows a steward's application as its store", () => {
    expect(
      applicantText({
        kind: "individual",
        accountId: ids.account(),
        email: EmailAddress.create("user-a@example.com"),
      }),
    ).toBe("あなた（個人）");
    expect(
      applicantText({ kind: "place", placeId: place, name: "喫茶こもれび" }),
    ).toBe("喫茶こもれび（店舗）");
  });

  it("shows the approver an individual by address, a withdrawn one as such", () => {
    expect(
      reviewerApplicantText({
        kind: "individual",
        accountId: ids.account(),
        email: EmailAddress.create("user-a@example.com"),
      }),
    ).toBe("user-a@example.com");
    expect(
      reviewerApplicantText({
        kind: "individual",
        accountId: ids.account(),
        email: null,
      }),
    ).toBe("退会した利用者");
    expect(
      reviewerApplicantText({
        kind: "place",
        placeId: place,
        name: "喫茶こもれび",
      }),
    ).toBe("店舗管理者として（喫茶こもれび）");
  });
});

describe("application status", () => {
  it("carries the answered return and the reply of a resubmission", () => {
    expect(
      statusData({
        kind: "underReview",
        since: new Date("2026-09-28T01:00:00.000Z"),
        answering: {
          request: ReturnRequest.create("写真を添えてください"),
          reply: ReturnReply.create("添えました"),
        },
      }),
    ).toEqual({
      kind: "underReview",
      since: "2026-09-28T01:00:00.000Z",
      answering: { request: "写真を添えてください", reply: "添えました" },
    });
  });

  it("marks a decision taken as the overdue proxy", () => {
    expect(
      statusData({
        kind: "rejected",
        reason: RejectionReason.create("範囲外です"),
        reviewAs: "overdue_proxy",
      }),
    ).toEqual({ kind: "rejected", reason: "範囲外です", overdueProxy: true });
  });

  it("words the premises a lapsed application broke", () => {
    expect(
      statusData({ kind: "lapsed", brokenPremises: ["applicantNotSteward"] }),
    ).toEqual({
      kind: "lapsed",
      premises: [
        "招待を承諾するなどして、すでにこの店舗の店舗管理者になっています。",
      ],
    });
  });
});

describe("application content", () => {
  it("quotes what a stewardship claimant wrote", () => {
    const claim = StewardshipClaim.create({
      relationship: "店主です",
      evidence: "店の電話",
    });
    const view: ApplicationContentView = {
      kind: "stewardship",
      placeId: ids.place(),
      relationship: claim.relationship,
      evidence: claim.evidence,
    };
    expect(contentData(view).rows).toEqual([
      { label: "店舗との関係", value: { kind: "quote", text: "店主です" } },
      {
        label: "確認に使える連絡先・資料",
        value: { kind: "quote", text: "店の電話" },
      },
    ]);
  });

  it("marks the proposed photos the listing no longer has and what approval would keep", () => {
    const kept = photoId();
    const removed = photoId();
    const listingId = ids.listing();
    const view: ApplicationContentView = {
      kind: "listingRevision",
      listingId,
      placeId: ids.place(),
      revision: {
        listing: "present",
        changes: [
          {
            field: "photos",
            current: [photo(kept)],
            proposed: [
              { ...photo(kept), origin: "current" },
              { ...photo(removed), origin: "current" },
            ],
          },
        ],
        preview: {
          name: ListingName.create("くるみパン"),
          description: null,
          category: null,
          photos: [photo(kept)],
          offering: { kind: "none" },
        },
      },
    };
    const data = contentData(view);
    expect(data.droppedPhotos).toBe(1);
    expect(data.noPhotoLeft).toBe(false);
    expect(data.compare?.[0]?.proposed).toEqual({
      kind: "photos",
      photos: [
        { photoId: kept, url: `/photos/${kept}`, framing: null, note: null },
        {
          photoId: removed,
          url: `/photos/${removed}`,
          framing: null,
          note: "外された",
        },
      ],
    });
    expect(applyPath(view)).toBe(`/apply/listings/${listingId}/revision`);
  });

  it("shows only the proposed values of a revision whose listing is gone", () => {
    const data = contentData({
      kind: "listingRevision",
      listingId: ids.listing(),
      placeId: ids.place(),
      revision: {
        listing: "deleted",
        proposals: [
          {
            field: "description",
            proposed: ListingDescription.create("しっとり"),
          },
        ],
      },
    });
    expect(data.targetGone).toBe(true);
    expect(data.compare).toBeNull();
    expect(data.rows).toEqual([
      { label: "説明", value: { kind: "text", text: "しっとり" } },
    ]);
  });
});
