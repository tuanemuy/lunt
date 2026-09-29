import { describe, expect, it } from "vitest";
import type { ApplicationContentView } from "../detail";
import { listApplicationsForSubject } from "../listApplicationsForSubject";
import { prepareReapplication } from "../prepareReapplication";
import { oct, stewardSeatKit } from "./stewardSeatKit";

/**
 * A participation application of place p1 (steward T) to occasion e1 with
 * listings l1 (one photo) and l2 (one framed photo).
 */
async function setUp() {
  const k = await stewardSeatKit();
  const e1 = await k.addOccasion({ name: "秋祭り" });
  const p1 = await k.place("山田珈琲店");
  const T = await k.manager(p1, "T");
  const l1 = await k.published(T, p1, { name: "ブレンド" });
  const l2 = await k.published(T, p1, {
    name: "ケーキ",
    photos: [
      {
        photoId: await k.photo(T),
        framing: { x: 0.1, y: 0.1, width: 0.5, height: 0.5 },
      },
    ],
  });
  const a6 = await k.participationApp(T, {
    placeId: p1,
    occasionId: e1,
    listingIds: [l1.id, l2.id],
    dates: [oct(2)],
  });
  return { k, e1, p1, T, l1, l2, a6 };
}

const listingsOf = (content: ApplicationContentView) => {
  if (content.kind !== "participation") throw new Error(content.kind);
  return content.listings;
};

describe("covers of a participation application's attached listings (CM-01, MY-05, EM-01, RQ-06)", () => {
  it("getMyApplication and getApplicationForReview: each attached listing's first photo with its framing and display ref", async () => {
    const { k, e1, T, l1, l2, a6 } = await setUp();
    const organizer = await k.organizer(e1);
    const expected = [
      expect.objectContaining({ id: l1.id, cover: l1.photos[0] }),
      expect.objectContaining({ id: l2.id, cover: l2.photos[0] }),
    ];
    expect(listingsOf((await k.mine(T, a6.id)).content)).toEqual(expected);
    expect(listingsOf((await k.forReview(organizer, a6.id)).content)).toEqual(
      expected,
    );
    expect(l2.photos[0]?.framing).not.toBeNull();
    expect(l1.photos[0]?.display).not.toBeNull();
  });

  it("listApplicationsForSubject: the participation's attached listings carry their covers", async () => {
    const { k, e1, l1, l2 } = await setUp();
    const organizer = await k.organizer(e1);
    const view = await listApplicationsForSubject({
      container: k.container,
      actor: organizer.actor,
      input: {
        subject: { kind: "occasion", id: e1 },
        pagination: { page: 1, limit: 10 },
      },
    });
    expect(view.items[0]?.participation?.listings).toEqual([
      expect.objectContaining({ id: l1.id, cover: l1.photos[0] }),
      expect.objectContaining({ id: l2.id, cover: l2.photos[0] }),
    ]);
  });

  it("prepareReapplication: a listing left out of the reapplication keeps its cover", async () => {
    const { k, T, l1, l2, a6 } = await setUp();
    await k.withdrawAs(T, a6.id);
    await k.unpublish(T, l2.id);
    const r = await prepareReapplication({
      container: k.container,
      actor: T.actor,
      input: { applicationId: a6.id },
    });
    if (r.content.kind !== "participation") throw new Error(r.content.kind);
    expect(r.content.listingIds).toEqual([l1.id]);
    expect(r.content.removedListings).toEqual([
      expect.objectContaining({ id: l2.id, cover: l2.photos[0] }),
    ]);
  });
});
