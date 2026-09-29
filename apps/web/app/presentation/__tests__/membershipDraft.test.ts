import { describe, expect, it } from "vitest";
import type { PlaceOption, RegionOption } from "../applyRelationsView";
import {
  type MembershipDraft,
  membershipDraftSchema,
} from "../membershipDraft";

const region: RegionOption = {
  regionId: "r1",
  name: "みなと商店街",
  meta: "神奈川県横浜市中区山下町 · 公開中",
  photoUrl: null,
  badges: [{ label: "公開の取り下げ", tone: "muted" }],
  viewable: true,
  refusal: {
    badge: "申請中",
    reason: "この店舗の申請が確認中のため選べません",
    go: { kind: "application", applicationId: "a1" },
  },
};

const place: PlaceOption = {
  placeId: "p1",
  name: "みなと雑貨",
  meta: "所属地域なし · 神奈川県横浜市中区山下町102-1",
  sub: "営業中",
  operating: "営業中",
  address: "神奈川県横浜市中区山下町102-1",
  photoUrl: "https://example.com/p.jpg",
  actingAs: "steward",
  viewable: true,
  refusal: null,
};

describe("RQ-05's kept input", () => {
  it("reads back what the form kept", () => {
    const draft: MembershipDraft = {
      place,
      kind: "affiliation",
      region,
      picking: false,
      reply: "",
      regionSearch: {
        keyword: "みなと",
        found: { keyword: "みなと", items: [region] },
      },
      placeSearch: null,
    };
    expect(
      membershipDraftSchema.parse(JSON.parse(JSON.stringify(draft))),
    ).toEqual(draft);
  });

  it("refuses a draft that no longer fits", () => {
    expect(membershipDraftSchema.safeParse({ place: null }).success).toBe(
      false,
    );
    expect(
      membershipDraftSchema.safeParse({
        place: { ...place, actingAs: "operator" },
        kind: "affiliation",
        region: null,
        picking: false,
        reply: "",
        regionSearch: null,
        placeSearch: null,
      }).success,
    ).toBe(false);
  });
});
