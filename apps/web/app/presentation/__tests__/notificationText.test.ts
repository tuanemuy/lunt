import type { ShowcaseChange } from "@repo/core/domain/notification/occurrence";
import { notificationIds } from "@repo/core/domain/notification/testing/samples";
import { describe, expect, it } from "vitest";
import { headline } from "../notificationText";

const ids = notificationIds();
const listing = { kind: "listing", id: ids.listing() } as const;
const place = { kind: "place", id: ids.place() } as const;
const region = { kind: "region", id: ids.region() } as const;
const occasion = { kind: "occasion", id: ids.occasion() } as const;

const CASES: readonly (readonly [ShowcaseChange, string])[] = [
  [
    { showcase: listing, change: "suspended" },
    "読みものの紹介先の掲載が運営による非公開になりました",
  ],
  [
    { showcase: listing, change: "unpublished" },
    "読みものの紹介先の掲載が一時非公開になりました",
  ],
  [
    { showcase: listing, change: "deleted" },
    "読みものの紹介先の掲載が削除されました",
  ],
  [
    { showcase: listing, change: "offering_ended" },
    "読みものの紹介先の掲載が提供終了になりました",
  ],
  [
    { showcase: listing, change: "place_suspended" },
    "読みものの紹介先の掲載の店舗が非公開になりました",
  ],
  [
    { showcase: listing, change: "place_closed" },
    "読みものの紹介先の掲載の店舗が閉店しました",
  ],
  [
    { showcase: place, change: "suspended" },
    "読みものの紹介先の店舗が非公開になりました",
  ],
  [
    { showcase: place, change: "closed" },
    "読みものの紹介先の店舗が閉店しました",
  ],
  [
    { showcase: region, change: "suspended" },
    "読みものの紹介先の地域が運営による非公開になりました",
  ],
  [
    { showcase: region, change: "unpublished" },
    "読みものの紹介先の地域が公開の取り下げになりました",
  ],
  [
    { showcase: occasion, change: "suspended" },
    "読みものの紹介先のイベントが運営による非公開になりました",
  ],
  [
    { showcase: occasion, change: "unpublished" },
    "読みものの紹介先のイベントが公開の取り下げになりました",
  ],
  [
    { showcase: occasion, change: "ended" },
    "読みものの紹介先のイベントが終了しました",
  ],
  [
    { showcase: occasion, change: "cancelled" },
    "読みものの紹介先のイベントが中止になりました",
  ],
];

describe("headline of a showcase change (editors)", () => {
  it.each(
    CASES.map(([change, text]) => ({
      name: `${change.showcase.kind} ${change.change}`,
      change,
      text,
    })),
  )("$name", ({ change, text }) => {
    expect(
      headline({
        to: "editors",
        articleId: ids.article(),
        matter: { kind: "showcase_changed", change },
      }),
    ).toBe(text);
  });

  it("covers every kind and change once", () => {
    const keys = CASES.map(
      ([change]) => `${change.showcase.kind}:${change.change}`,
    );
    expect(new Set(keys).size).toBe(14);
  });
});
