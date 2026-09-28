import type { NotificationView } from "@repo/core/application/notification/listNotifications";
import { NotificationId } from "@repo/core/domain/common/ids";
import { notificationIds } from "@repo/core/domain/notification/testing/samples";
import { describe, expect, it } from "vitest";
import { toNotificationItem } from "../notificationList";

const ids = notificationIds();

describe("notification list item", () => {
  it("names a retired category's current successor and opens the place's listings", () => {
    const P = { kind: "place", id: ids.place() } as const;
    const K = ids.category();
    const view: NotificationView = {
      id: NotificationId.create(ids.account()),
      occurrence: {
        to: "placeStewards",
        placeId: P.id,
        subject: {
          kind: "place",
          matter: { kind: "categories_reassigned", retiredCategoryId: K },
        },
      },
      delivery: "direct",
      createdAt: new Date("2026-09-28T00:00:00.000Z"),
      pointedContent: P,
      vacantTarget: null,
      labels: [
        { ref: P, label: "山田珈琲店" },
        { ref: { kind: "category", id: K }, label: "食べる" },
      ],
      destination: {
        kind: "placeManagement",
        placeId: P.id,
        facet: "listings",
      },
      reassignedTo: { id: ids.category(), name: "飲食" },
    };
    const item = toNotificationItem(view);
    expect(item.title).toBe(
      "カテゴリーの廃止に伴い、掲載のカテゴリーが付け替わりました",
    );
    expect(item.meta).toBe(
      "店舗「山田珈琲店」 · カテゴリー「食べる」 · 付け替え先: カテゴリー「飲食」",
    );
    expect(item.href).toBe(`/manage/places/${P.id}/listings`);
  });

  it("words an application by its kind and its subjects' names", () => {
    const Ap = ids.application();
    const view: NotificationView = {
      id: NotificationId.create(ids.account()),
      occurrence: {
        to: "applicant",
        applicant: { kind: "individual" },
        applicationId: Ap,
        matter: "approved",
      },
      delivery: "direct",
      createdAt: new Date("2026-09-28T00:00:00.000Z"),
      pointedContent: null,
      vacantTarget: null,
      labels: [
        {
          ref: { kind: "application", id: Ap },
          label: {
            applicationKind: "listing",
            subjects: [
              { kind: "listing", name: "季節のパフェ" },
              { kind: "place", name: "山田珈琲店" },
            ],
          },
        },
      ],
      destination: { kind: "ownApplication", applicationId: Ap },
      reassignedTo: null,
    };
    const item = toNotificationItem(view);
    expect(item.meta).toBe(
      "掲載の申請（掲載「季節のパフェ」、店舗「山田珈琲店」）",
    );
    expect(item.href).toBe(`/me/applications/${Ap}`);
  });
});
