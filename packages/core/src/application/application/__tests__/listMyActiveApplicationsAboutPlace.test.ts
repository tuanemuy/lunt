import type { PlaceId } from "@repo/core/domain/common/ids";
import { describe, expect, it } from "vitest";
import type { Person } from "../../authority/__tests__/kit";
import { listMyActiveApplicationsAboutPlace } from "../listMyActiveApplicationsAboutPlace";
import { type ReviewKit, reviewKit } from "./reviewKit";

const placeRef = (id: PlaceId) => ({ kind: "place", id }) as const;

const read = (k: ReviewKit, who: Person, placeId: PlaceId) =>
  listMyActiveApplicationsAboutPlace({
    container: k.container,
    actor: who.actor,
    input: { placeId },
  });

describe("listMyActiveApplicationsAboutPlace", () => {
  it.todo(
    "listMyActiveApplicationsAboutPlace#1 店舗 p2 に店舗管理者がいない。利用者 A が個人として行った、p2 の地域 X への所属の申請 a1（確認中）、p2 の地域 Y への所属の申請 a2（差し戻し）、p2 の情報修正の申請 a3（確認中）がある / A が p2 について読む",
  );

  it("the actor's own active applications about the place come with kind, subjects and status; closed ones, others' and other places' are left out", async () => {
    const k = await reviewKit();
    const A = await k.person("A");
    const B = await k.person("B");
    const { placeId: p2 } = await k.placeWithPhotos("山田珈琲店", 0);
    const { placeId: p3 } = await k.placeWithPhotos("別の店", 0);
    const l1 = await k.listing(p2);
    const a3 = await k.revise(A, p2);
    const returned = await k.reviseListing(A, l1);
    await k.sendBackAs(k.O, returned.id);
    const rejected = await k.claim(A, { placeId: p2 });
    await k.rejectAs(k.O, rejected.id);
    const withdrawn = await k.newListing(A, p2);
    await k.withdrawAs(A, withdrawn.id);
    await k.revise(B, p2);
    await k.revise(A, p3);

    const items = await read(k, A, p2);

    expect(items).toEqual([
      {
        id: a3.id,
        kind: "revision",
        subjects: [placeRef(p2)],
        status: expect.objectContaining({ kind: "underReview" }),
        version: a3.version,
      },
      {
        id: returned.id,
        kind: "listingRevision",
        subjects: [placeRef(p2), { kind: "listing", id: l1 }],
        status: expect.objectContaining({ kind: "returned" }),
        version: expect.any(Number),
      },
    ]);
  });

  it.todo(
    "listMyActiveApplicationsAboutPlace#2 A が個人として行った、p2 の地域 Z への所属の申請 a4 は否認、p2 の X からの離脱の申請 a5 は取り下げになっている / A が p2 について読む",
  );

  it.todo(
    "listMyActiveApplicationsAboutPlace#3 利用者 B が個人として行った、p2 の X への所属の申請 b1 が確認中 / A が p2 について読む",
  );

  it.todo(
    "listMyActiveApplicationsAboutPlace#4 利用者 S は店舗 p1 の店舗管理者。p1 が店舗管理者として行った X への所属の申請 c1 が確認中 / S が p1 について読む",
  );

  it.todo(
    "listMyActiveApplicationsAboutPlace#5 A が個人として行った、店舗 p3 の X への所属の申請が確認中 / A が p2 について読む",
  );

  it("listMyActiveApplicationsAboutPlace#6 A が p2 について行った進行中の申請がない / A が p2 について読む", async () => {
    const k = await reviewKit();
    const A = await k.person("A");
    const p2 = await k.place();

    expect(await read(k, A, p2)).toEqual([]);
  });
});
