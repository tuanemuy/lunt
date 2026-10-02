import { PERIODS } from "@repo/core/adapters/durableObject/__conformance__/discoveryFixtures";
import { day } from "@repo/core/adapters/durableObject/__conformance__/listingFixtures";
import type { Actor } from "@repo/core/domain/common/actor";
import { DateRange } from "@repo/core/domain/common/dateRange";
import { OccasionId } from "@repo/core/domain/common/ids";
import { Occasion } from "@repo/core/domain/occasion/occasion";
import { ParticipationDetails } from "@repo/core/domain/occasion/participation";
import { describe, expect, it } from "vitest";
import { OCCASION_NOT_FOUND, viewOccasion } from "../viewOccasion";
import { type DiscoveryKit, discoveryKit, expectNotFound } from "./kit";

const view = (
  k: DiscoveryKit,
  occasionId: OccasionId,
  actor: Actor | null = null,
) => viewOccasion({ container: k.container, actor, input: { occasionId } });

type Out = Awaited<ReturnType<typeof view>>;

const participantIds = (out: Out) =>
  out.participants.map((participant) => participant.place.placeId);

const regionIds = (out: Out) => out.regions.map((summary) => summary.regionId);

describe("viewOccasion", () => {
  it("viewOccasion#1 開催中のイベント E に、掲載と参加日を添えた参加店舗と、関連づけられた公開中の地域がある / E を読む", async () => {
    const k = await discoveryKit();
    const E = await k.w.occasion({
      period: PERIODS.ongoing,
      photos: 2,
      tagline: "夏の市",
      description: "路地で開く市",
    });
    const P = await k.w.place({ photos: 1 });
    const L = await k.w.available(P.id);
    const dates = [day("2026-07-09"), day("2026-07-11")];
    await k.w.participate(E.id, P.id, { listingIds: [L.id], dates });
    const X = await k.w.region();
    await k.w.link(E.id, X.id);
    const out = await view(k, E.id);
    expect(out.occasion).toEqual({
      occasionId: E.id,
      name: E.content.name,
      tagline: "夏の市",
      description: "路地で開く市",
      period: E.content.period,
      venue: E.content.venue,
      photos: E.content.photos.items,
      standing: { kind: "occasion", holding: "ongoing" },
    });
    expect(out.occasion.photos).toHaveLength(2);
    expect(out.participants).toHaveLength(1);
    const [participant] = out.participants;
    expect(participant?.place.placeId).toBe(P.id);
    expect(participant?.place.standing).toEqual({
      kind: "place",
      operating: "open",
    });
    expect(participant?.listings.map((summary) => summary.listingId)).toEqual([
      L.id,
    ]);
    expect(participant?.listings[0]?.placeId).toBe(P.id);
    expect(participant?.dates).toEqual(dates);
    expect(regionIds(out)).toEqual([X.id]);
    expect(out.hasNoViewableListing).toBe(false);
    expect(Object.keys(out.photos).sort()).toEqual(
      [
        ...E.content.photos.items.map((photo) => photo.photoId),
        ...P.profile.photos.items.map((photo) => photo.photoId),
        ...L.content.photos.items.map((photo) => photo.photoId),
        ...X.content.photos.items.map((photo) => photo.photoId),
      ].sort(),
    );
  });

  it("viewOccasion#2 店舗 P（先に参加が成立）と店舗 Q（後に成立）が参加中。P は掲載 l2・l1 をこの順に添え、参加日は 5/3 と 5/1 / E を読む", async () => {
    const k = await discoveryKit();
    const period = ["2026-05-01", "2026-05-05"] as const;
    const E = await k.w.occasion({ period });
    const P = await k.w.place();
    const Q = await k.w.place();
    const l1 = await k.w.available(P.id);
    const l2 = await k.w.available(P.id);
    const details = ParticipationDetails.create(
      {
        listingIds: [l2.id, l1.id],
        dates: [day("2026-05-03"), day("2026-05-01")],
      },
      {
        period: DateRange.create(day(period[0]), day(period[1])),
        attachableListingIds: new Set([l1.id, l2.id]),
      },
      null,
    );
    await k.w.participate(E.id, P.id, details);
    await k.w.participate(E.id, Q.id);
    const out = await view(k, E.id);
    expect(participantIds(out)).toEqual([P.id, Q.id]);
    const [ofP] = out.participants;
    expect(ofP?.listings.map((summary) => summary.listingId)).toEqual([
      l2.id,
      l1.id,
    ]);
    expect(ofP?.dates).toEqual([day("2026-05-01"), day("2026-05-03")]);
  });

  it("viewOccasion#3 参加日 5/1・5/5 を持つ参加があり、その後に開催期間が 5/1〜5/3 に更新された / E を読む", async () => {
    const k = await discoveryKit();
    const E = await k.w.occasion({ period: ["2026-05-01", "2026-05-05"] });
    const P = await k.w.place();
    await k.w.participate(E.id, P.id, {
      dates: [day("2026-05-01"), day("2026-05-05")],
    });
    await k.w.updateOccasion(
      E,
      (stored) =>
        Occasion.updateContent(
          stored,
          {
            ...stored.content,
            period: DateRange.create(day("2026-05-01"), day("2026-05-03")),
          },
          k.w.f.tick(),
        ).entity,
    );
    const [participant] = (await view(k, E.id)).participants;
    expect(participant?.dates).toEqual([day("2026-05-01")]);
  });

  it("viewOccasion#4 参加店舗に、閉店した店舗と休業中の店舗がある。添えた掲載に、提供開始前の掲載と提供終了の掲載がある / E を読む", async () => {
    const k = await discoveryKit();
    const E = await k.w.occasion();
    const closed = await k.w.place({ status: "permanentlyClosed" });
    const resting = await k.w.place({ status: "temporarilyClosed" });
    const upcoming = await k.w.upcoming(resting.id);
    const ended = await k.w.endedBySchedule(resting.id);
    await k.w.participate(E.id, closed.id);
    await k.w.participate(E.id, resting.id, {
      listingIds: [upcoming.id, ended.id],
    });
    const out = await view(k, E.id);
    expect(
      out.participants.map((participant) => participant.place.standing),
    ).toEqual([
      { kind: "place", operating: "permanentlyClosed" },
      { kind: "place", operating: "temporarilyClosed" },
    ]);
    expect(
      out.participants[1]?.listings.map(
        (summary) => summary.standing.offering.phase,
      ),
    ).toEqual(["upcoming", "ended"]);
  });

  it("viewOccasion#5 参加店舗の1つが非公開。別の参加店舗の添えた掲載の1つが一時非公開 / E を読む", async () => {
    const k = await discoveryKit();
    const E = await k.w.occasion();
    const hidden = await k.w.place({ suspended: true });
    const P = await k.w.place();
    const kept = await k.w.available(P.id);
    const withdrawn = await k.w.unpublished(P.id);
    await k.w.participate(E.id, hidden.id);
    await k.w.participate(E.id, P.id, {
      listingIds: [kept.id, withdrawn.id],
    });
    const out = await view(k, E.id);
    expect(out.occasion.occasionId).toBe(E.id);
    expect(participantIds(out)).toEqual([P.id]);
    expect(
      out.participants[0]?.listings.map((summary) => summary.listingId),
    ).toEqual([kept.id]);
  });

  it("viewOccasion#6 開催期間の開始が今日より後のイベント / 読む", async () => {
    const k = await discoveryKit();
    const E = await k.w.occasion({ period: PERIODS.upcoming });
    expect((await view(k, E.id)).occasion.standing).toEqual({
      kind: "occasion",
      holding: "upcoming",
    });
  });

  it("viewOccasion#7 開催期間の終了が今日より前のイベントと、中止にしたイベント / それぞれを読む", async () => {
    const k = await discoveryKit();
    const ended = await k.w.occasion({ period: PERIODS.ended });
    const cancelled = await k.w.occasion({
      period: PERIODS.ongoing,
      state: "cancelled",
    });
    expect((await view(k, ended.id)).occasion.standing.holding).toBe("ended");
    expect((await view(k, cancelled.id)).occasion.standing.holding).toBe(
      "cancelled",
    );
  });

  it("viewOccasion#8 参加店舗はあるが、添えた掲載に閲覧できるものが1つもない / E を読む", async () => {
    const k = await discoveryKit();
    const E = await k.w.occasion();
    const P = await k.w.place();
    const Q = await k.w.place();
    const draft = await k.w.draft(P.id);
    await k.w.participate(E.id, P.id, { listingIds: [draft.id] });
    await k.w.participate(E.id, Q.id);
    const out = await view(k, E.id);
    expect(participantIds(out)).toEqual([P.id, Q.id]);
    expect(out.participants.map((participant) => participant.listings)).toEqual(
      [[], []],
    );
    expect(out.hasNoViewableListing).toBe(true);
  });

  it("viewOccasion#9 地域 X（先に関連づけ）と地域 Y（後に関連づけ）が関連づけられている。地域 Z との関連づけは地域の側が解除している。地域 W は公開の取り下げ中 / E を読む", async () => {
    const k = await discoveryKit();
    const E = await k.w.occasion();
    const Y = await k.w.region();
    const X = await k.w.region();
    const Z = await k.w.region();
    const W = await k.w.region();
    await k.w.link(E.id, X.id);
    await k.w.link(E.id, W.id);
    await k.w.link(E.id, Y.id);
    await k.w.link(E.id, Z.id, { detached: true });
    await k.w.unpublishRegion(W);
    expect(regionIds(await view(k, E.id))).toEqual([X.id, Y.id]);
  });

  it("viewOccasion#10 イベントが、下書き、公開の取り下げ、運営による非公開のいずれか。または、その ID のイベントがない / そのイベントを読む", async () => {
    const k = await discoveryKit();
    const ids = [
      (await k.w.occasion({ state: "draft" })).id,
      (await k.w.occasion({ state: "unpublished" })).id,
      (await k.w.occasion({ state: "suspended" })).id,
      OccasionId.create(k.idGenerator.next()),
    ];
    for (const id of ids) {
      await expectNotFound(view(k, id), OCCASION_NOT_FOUND);
    }
  });

  it("viewOccasion#11 開催前のイベント E。利用者 A は店舗 P の管理者。利用者 B は地域 X の管理者で、どの店舗の管理者でもない / ログインせずに E を読む。A として読む。B として読む", async () => {
    const k = await discoveryKit();
    const E = await k.w.occasion({ period: PERIODS.upcoming });
    const P = await k.w.place();
    const X = await k.w.region();
    const A = await k.person();
    const B = await k.person();
    await k.appoint(P.id, A);
    await k.grant({ kind: "region", id: X.id }, B);
    const signedOut = await view(k, E.id);
    const asA = await view(k, E.id, A.actor);
    const asB = await view(k, E.id, B.actor);
    expect(signedOut.viewerManagesPlace).toBe(false);
    expect(asA.viewerManagesPlace).toBe(true);
    expect(asB.viewerManagesPlace).toBe(false);
    const { viewerManagesPlace: _a, ...contentA } = asA;
    const { viewerManagesPlace: _b, ...contentB } = asB;
    const { viewerManagesPlace: _s, ...contentSignedOut } = signedOut;
    expect(contentA).toEqual(contentSignedOut);
    expect(contentB).toEqual(contentSignedOut);
  });

  it("viewOccasion#12 利用者 C は、店舗 P への招待の宛先だが、まだ承諾していない。どの店舗の管理者でもない / C として E を読む", async () => {
    const k = await discoveryKit();
    const E = await k.w.occasion();
    const P = await k.w.place();
    const C = await k.person();
    await k.invite(P.id, C);
    expect((await view(k, E.id, C.actor)).viewerManagesPlace).toBe(false);
  });
});
