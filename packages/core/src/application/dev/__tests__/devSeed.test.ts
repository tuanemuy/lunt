import { StructuralPhotoInspector } from "@repo/core/adapters/photos/structuralPhotoInspector";
import { createTestContainer } from "@repo/core/application/__tests__/testContainer";
import { ForbiddenError, NotFoundError } from "@repo/core/application/errors";
import { ArticleId, ListingId } from "@repo/core/domain/common/ids";
import { LocalDate } from "@repo/core/domain/common/localDate";
import { Pagination } from "@repo/core/domain/common/pagination";
import { describe, expect, it } from "vitest";
import { invitationEmails, stewardIds } from "../../authority/__tests__/kit";
import { getManagedListing } from "../../listing/getManagedListing";
import { listCategories } from "../../listing/listCategories";
import { getManagedOccasion } from "../../occasion/getManagedOccasion";
import { listOccasionParticipants } from "../../occasion/listOccasionParticipants";
import { listOccasionRegionLinks } from "../../occasion/listOccasionRegionLinks";
import { getManagedPlace } from "../../place/getManagedPlace";
import { getManagedRegion } from "../../region/getManagedRegion";
import { getPlaceAffiliationStatus } from "../../region/getPlaceAffiliationStatus";
import { listAffiliatedPlaces } from "../../region/listAffiliatedPlaces";
import { devSeed, type SeedFixture } from "../devSeed";
import { seedPhotoPng } from "../seedPhoto";

const START = "2026-09-28T01:00:00.000Z";
const TODAY = LocalDate.fromInstant(new Date(START));
const day = (offset: number): string =>
  LocalDate.format(LocalDate.addDays(TODAY, offset));

const FIXTURE: SeedFixture = {
  accounts: [
    "op1@example.com",
    "op2@example.com",
    "ed1@example.com",
    "owner-x@example.com",
    "owner-y@example.com",
    "user-b@example.com",
    "user-a@example.com",
  ],
  operators: ["op1@example.com", "op2@example.com"],
  editors: ["ed1@example.com"],
  categories: ["食べる", "カフェ"],
  places: [
    {
      key: "P1",
      name: "喫茶ひだまり",
      description: "自家焙煎のコーヒー",
      businessHours: "9:00〜18:00",
      contact: "03-1234-5678",
      address: { postalCode: "100-0004", rest: "2-1-1" },
      location: { latitude: 35.686, longitude: 139.766 },
      photos: ["hidamari-1.jpg", "hidamari-2.jpg"],
      members: [
        { appoint: "owner-x@example.com" },
        {
          invite: "owner-y@example.com",
          by: "owner-x@example.com",
          accept: true,
        },
        {
          invite: "user-b@example.com",
          by: "owner-x@example.com",
          accept: true,
        },
        { resign: "user-b@example.com" },
        { invite: "newbie@example.com", by: "owner-x@example.com" },
      ],
      listings: [
        {
          key: "L1",
          name: "コーヒー教室",
          description: "毎回定員6名",
          category: "カフェ",
          photos: ["coffee-3.jpg"],
          offering: { kind: "dates", dates: ["today+7", "today+14"] },
          state: "published",
        },
        { key: "L2", name: "季節のケーキ", state: "draft" },
        {
          key: "L3",
          name: "藍染め体験",
          category: "食べる",
          photos: ["aizome.jpg"],
          state: "unpublished",
        },
        {
          key: "L4",
          name: "ろくろ教室",
          category: "食べる",
          photos: ["rokuro.jpg"],
          state: "ended",
        },
        {
          key: "L5",
          name: "夏のかき氷",
          category: "食べる",
          photos: ["cake-1.jpg"],
          state: "published",
          offeringAfterPublish: {
            kind: "period",
            start: "today-30",
            end: "today-1",
          },
        },
        {
          key: "L6",
          name: "焙煎豆",
          category: "カフェ",
          photos: ["cake-1.jpg"],
          state: "published",
          suspended: true,
        },
      ],
    },
    {
      key: "P2",
      name: "乙町パン",
      address: { postalCode: "9990001", town: "乙町", rest: "1-1" },
      location: { latitude: 34.7, longitude: 135.5 },
      operatingStatus: "temporarilyClosed",
      listings: [
        {
          key: "L7",
          name: "くるみパン",
          category: "食べる",
          photos: ["kurumi-1.jpg"],
          state: "published",
        },
      ],
      suspended: true,
    },
  ],
};

const AREA = { postalCode: "100-0004", rest: "1-1" } as const;
const NEAR = { latitude: 35.686, longitude: 139.766 } as const;

const AREA_FIXTURE: SeedFixture = {
  accounts: [
    "op1@example.com",
    "region-op@example.com",
    "region-op2@example.com",
    "event-op@example.com",
    "event-op2@example.com",
    "owner-x@example.com",
  ],
  operators: ["op1@example.com"],
  categories: ["食べる"],
  places: [
    {
      key: "P1",
      name: "喫茶ひだまり",
      address: AREA,
      location: NEAR,
      members: [{ appoint: "owner-x@example.com" }],
      listings: [
        {
          key: "L1",
          name: "ブレンドコーヒー",
          category: "食べる",
          photos: ["blend.jpg"],
          state: "published",
        },
        {
          key: "L2",
          name: "季節のケーキ",
          category: "食べる",
          photos: ["cake.jpg"],
          state: "unpublished",
        },
      ],
    },
    {
      key: "P2",
      name: "古書かもめ",
      address: AREA,
      location: NEAR,
      listings: [
        {
          key: "L3",
          name: "古地図の複製",
          category: "食べる",
          photos: ["chizu.jpg"],
          state: "published",
        },
      ],
      suspended: true,
    },
  ],
  regions: [
    {
      key: "R1",
      name: "甲商店街",
      address: AREA,
      location: NEAR,
      photos: ["region-seed.jpg", "region-seed.jpg"],
      description: "昔ながらの店が並ぶ商店街です。",
      tagline: "駅から続く商店街",
      publication: "published",
      members: [
        { appoint: "region-op@example.com" },
        {
          invite: "region-op2@example.com",
          by: "region-op@example.com",
          accept: true,
        },
        { invite: "nobody@example.com", by: "region-op@example.com" },
      ],
    },
    {
      key: "R2",
      name: "乙通り",
      address: AREA,
      location: NEAR,
      photos: ["region-seed.jpg"],
      publication: "unpublished",
      members: [{ appoint: "region-op@example.com" }],
    },
    {
      key: "R3",
      name: "丙地区",
      address: AREA,
      location: NEAR,
      photos: ["region-seed.jpg"],
      publication: "published",
      suspended: true,
    },
    { key: "R4", name: "丁の丘", publication: "draft" },
    {
      key: "R5",
      name: "戊エリア",
      address: AREA,
      location: NEAR,
      photos: ["region-seed.jpg"],
      publication: "published",
    },
  ],
  affiliations: [
    { place: "P1", regions: ["R1", "R2"], representative: "R2" },
    { place: "P2", regions: ["R3", "R1"] },
  ],
  occasions: [
    {
      key: "O1",
      name: "甲まつり",
      period: { start: "today+10", end: "today+12" },
      address: AREA,
      location: NEAR,
      photos: ["event-photo-1.jpg"],
      tagline: "海辺の夏の祭り",
      publication: "published",
      members: [
        { appoint: "event-op@example.com" },
        { appoint: "event-op2@example.com" },
      ],
      regionLinks: [
        { region: "R1" },
        { region: "R3" },
        { region: "R5", detached: true },
      ],
      participations: [
        { place: "P1", listings: ["L1", "L2"], dates: ["today+10"] },
        { place: "P2", listings: ["L3"], dates: ["today+11"] },
      ],
    },
    {
      key: "O2",
      name: "乙古本市",
      period: { start: "today-10", end: "today-8" },
      address: AREA,
      location: NEAR,
      photos: ["event-photo-1.jpg"],
      publication: "published",
      members: [{ appoint: "event-op@example.com" }],
      participations: [{ place: "P1", dates: ["today-9"] }],
    },
    {
      key: "O3",
      name: "丙あかり展",
      period: { start: "today+30", end: "today+31" },
      address: AREA,
      location: NEAR,
      photos: ["event-photo-1.jpg"],
      publication: "published",
      cancelled: true,
      members: [{ appoint: "event-op@example.com" }],
    },
    {
      key: "O4",
      name: "丁マルシェ",
      period: { start: "today+60", end: "today+61" },
      address: AREA,
      location: NEAR,
      photos: ["event-photo-1.jpg"],
      publication: "unpublished",
      members: [{ appoint: "event-op@example.com" }],
    },
    {
      key: "O5",
      name: "戊花火大会",
      period: { start: "today+40", end: "today+40" },
      address: AREA,
      location: NEAR,
      photos: ["event-photo-1.jpg"],
      publication: "draft",
      members: [{ appoint: "event-op@example.com" }],
    },
    {
      key: "O6",
      name: "己フェス",
      period: { start: "today+20", end: "today+21" },
      address: AREA,
      location: NEAR,
      photos: ["event-photo-1.jpg"],
      publication: "published",
      suspended: true,
    },
  ],
};

describe("devSeed (development tool)", () => {
  it("puts a whole fixture in through the product's usecases", async () => {
    const t = createTestContainer({ start: START });
    const { container } = t;

    const result = await devSeed({ container, input: FIXTURE });

    expect(Object.keys(result.accounts)).toEqual(FIXTURE.accounts);
    expect(Object.keys(result.places)).toEqual(["P1", "P2"]);
    expect(Object.keys(result.listings)).toEqual([
      "L1",
      "L2",
      "L3",
      "L4",
      "L5",
      "L6",
      "L7",
    ]);
    expect(
      (await listCategories({ container })).map((category) => category.name),
    ).toEqual(["食べる", "カフェ"]);
    expect(Object.keys(result.categories)).toEqual(["食べる", "カフェ"]);

    const accountOf = (email: string) => {
      const accountId = result.accounts[email];
      if (accountId === undefined) throw new Error(email);
      return { accountId };
    };
    const operator = accountOf("op1@example.com");
    const ownerX = accountOf("owner-x@example.com");
    const idOf = <T extends string>(
      ids: Readonly<Record<string, T>>,
      key: string,
    ): T => {
      const id = ids[key];
      if (id === undefined) throw new Error(key);
      return id;
    };

    const p1 = await getManagedPlace({
      container,
      actor: ownerX,
      input: { placeId: idOf(result.places, "P1") },
    });
    expect(p1.place.profile.name).toBe("喫茶ひだまり");
    expect(p1.place.profile.address.town).toBe("大手町");
    expect(p1.photos).toHaveLength(2);
    const stewardship = await container.unitOfWorkProvider.run((ctx) =>
      ctx.stewardshipRepository.findById({
        kind: "place",
        id: p1.place.id,
      }),
    );
    if (stewardship === null) throw new Error("no stewardship");
    expect(stewardIds(stewardship.entity)).toEqual([
      ownerX.accountId,
      accountOf("owner-y@example.com").accountId,
    ]);
    expect(invitationEmails(stewardship.entity)).toEqual([
      "newbie@example.com",
    ]);

    const p2 = await getManagedPlace({
      container,
      actor: operator,
      input: { placeId: idOf(result.places, "P2") },
    });
    expect(p2.place.profile.address.town).toBe("乙町");
    expect(p2.place.operatingStatus).toBe("temporarilyClosed");
    expect(p2.suspended).toBe(true);

    const listing = (key: string, actor = ownerX) =>
      getManagedListing({
        container,
        actor,
        input: { listingId: idOf(result.listings, key) },
      });
    const l1 = await listing("L1");
    expect(l1.publication.status).toBe("published");
    expect(l1.category?.name).toBe("カフェ");
    expect(l1.offering).toEqual({ kind: "dates", dates: [day(7), day(14)] });
    expect((await listing("L2")).publication.status).toBe("draft");
    expect((await listing("L3")).publication).toMatchObject({
      status: "unpublished",
      reason: "byManager",
    });
    expect((await listing("L4")).offeringStatus).toMatchObject({
      phase: "ended",
    });
    const l5 = await listing("L5");
    expect(l5.publication.status).toBe("published");
    expect(l5.offering).toEqual({
      kind: "period",
      period: { start: day(-30), end: day(-1) },
    });
    expect((await listing("L6")).suspended).toBe(true);
    expect((await listing("L7", operator)).place.name).toBe("乙町パン");

    const events = await t.storedEvents();
    const appointments = events
      .filter((event) => event.type === "authority.steward_appointed")
      .map((event) => event.payload);
    expect(appointments).toEqual([
      expect.objectContaining({
        accountId: ownerX.accountId,
        via: "application",
      }),
      expect.objectContaining({ via: "invitation" }),
      expect.objectContaining({ via: "invitation" }),
    ]);
    const types = new Set(events.map((event) => event.type));
    for (const type of [
      "authority.role_granted",
      "authority.invitation_issued",
      "authority.steward_removed",
      "category.retired",
      "listing.unpublished",
      "listing.suspended",
      "place.operating_status_changed",
      "place.suspended",
    ]) {
      expect(types).toContain(type);
    }
  });

  it("seeds regions, affiliations and occasions with their links and participations", async () => {
    const t = createTestContainer({ start: START });
    const { container } = t;
    const result = await devSeed({ container, input: AREA_FIXTURE });
    expect(Object.keys(result.regions)).toEqual(["R1", "R2", "R3", "R4", "R5"]);
    expect(Object.keys(result.occasions)).toEqual([
      "O1",
      "O2",
      "O3",
      "O4",
      "O5",
      "O6",
    ]);

    const accountOf = (email: string) => {
      const accountId = result.accounts[email];
      if (accountId === undefined) throw new Error(email);
      return { accountId };
    };
    const idOf = <T extends string>(
      ids: Readonly<Record<string, T>>,
      key: string,
    ): T => {
      const id = ids[key];
      if (id === undefined) throw new Error(key);
      return id;
    };
    const operator = accountOf("op1@example.com");
    const regionOp = accountOf("region-op@example.com");
    const eventOp = accountOf("event-op@example.com");
    const ownerX = accountOf("owner-x@example.com");
    const page = Pagination.create({ page: 1, limit: 100 });

    const region = (key: string, actor = operator) =>
      getManagedRegion({
        container,
        actor,
        input: { regionId: idOf(result.regions, key) },
      });
    const r1 = await region("R1", regionOp);
    expect(r1.region.content.name).toBe("甲商店街");
    expect(r1.region.content.tagline).toBe("駅から続く商店街");
    expect(r1.region.content.address?.town).toBe("大手町");
    expect(r1.photos).toHaveLength(2);
    expect(r1.region.publication.status).toBe("published");
    expect(r1.management).toMatchObject({ allowed: true });
    const r1Stewards = await container.unitOfWorkProvider.run((ctx) =>
      ctx.stewardshipRepository.findById({ kind: "region", id: r1.region.id }),
    );
    if (r1Stewards === null) throw new Error("no stewardship");
    expect(stewardIds(r1Stewards.entity)).toEqual([
      regionOp.accountId,
      accountOf("region-op2@example.com").accountId,
    ]);
    expect(invitationEmails(r1Stewards.entity)).toEqual(["nobody@example.com"]);
    expect((await region("R2")).region.publication).toMatchObject({
      status: "unpublished",
      reason: "byManager",
    });
    const r3 = await region("R3");
    expect(r3.region.publication.status).toBe("published");
    expect(r3.suspended).toBe(true);
    const r4 = await region("R4");
    expect(r4.region.publication.status).toBe("draft");
    expect(r4.hasSteward).toBe(false);
    expect((await region("R5")).viewable).toBe(true);

    const status = await getPlaceAffiliationStatus({
      container,
      actor: ownerX,
      input: { placeId: idOf(result.places, "P1") },
    });
    expect(status.regions.map((r) => r.regionId)).toEqual([
      idOf(result.regions, "R1"),
      idOf(result.regions, "R2"),
    ]);
    expect(status.representative).toEqual({
      regionId: idOf(result.regions, "R2"),
      chosen: true,
    });
    const affiliated = await listAffiliatedPlaces({
      container,
      actor: regionOp,
      input: { regionId: idOf(result.regions, "R1"), pagination: page },
    });
    expect(affiliated.items.map((p) => p.placeId)).toEqual([
      idOf(result.places, "P2"),
      idOf(result.places, "P1"),
    ]);
    expect(affiliated.items[0]?.suspended).toBe(true);

    const occasion = (key: string, actor = operator) =>
      getManagedOccasion({
        container,
        actor,
        input: { occasionId: idOf(result.occasions, key) },
      });
    const o1 = await occasion("O1", eventOp);
    expect(o1).toMatchObject({
      name: "甲まつり",
      period: { start: day(10), end: day(12) },
      holdingStatus: "upcoming",
      publication: { status: "published" },
      viewable: true,
      access: { hasSteward: true, manageable: true },
    });
    expect(o1.address?.town).toBe("大手町");
    const links = await listOccasionRegionLinks({
      container,
      actor: eventOp,
      input: { occasionId: o1.id, pagination: page },
    });
    expect(links.items.map((link) => [link.region.name, link.status])).toEqual([
      ["甲商店街", "linked"],
      ["丙地区", "linked"],
      ["戊エリア", "detached"],
    ]);
    const participants = await listOccasionParticipants({
      container,
      actor: eventOp,
      input: { occasionId: o1.id, pagination: page },
    });
    expect(
      participants.items.map((item) => ({
        place: item.place.id,
        hasSteward: item.placeHasSteward,
        listings: item.participation.listings.map((l) => l.id),
        dates: item.participation.dates,
      })),
    ).toEqual([
      {
        place: idOf(result.places, "P2"),
        hasSteward: false,
        listings: [idOf(result.listings, "L3")],
        dates: [day(11)],
      },
      {
        place: idOf(result.places, "P1"),
        hasSteward: true,
        listings: [idOf(result.listings, "L1"), idOf(result.listings, "L2")],
        dates: [day(10)],
      },
    ]);
    expect(participants.items[1]?.participation.listings[1]).toMatchObject({
      publication: { status: "unpublished" },
    });

    expect(await occasion("O2", eventOp)).toMatchObject({
      holdingStatus: "ended",
    });
    expect(await occasion("O3", eventOp)).toMatchObject({
      cancelled: true,
      holdingStatus: "cancelled",
      publication: { status: "published" },
    });
    expect(await occasion("O4", eventOp)).toMatchObject({
      publication: { status: "unpublished" },
    });
    expect(await occasion("O5", eventOp)).toMatchObject({
      publication: { status: "draft" },
      missingRequirements: [],
    });
    expect(await occasion("O6")).toMatchObject({
      suspended: true,
      access: { hasSteward: false },
    });

    const events = await t.storedEvents();
    const payloads = (type: string) =>
      events.filter((event) => event.type === type).map((e) => e.payload);
    expect(payloads("region.affiliation_established")).toEqual([
      expect.objectContaining({ placeId: idOf(result.places, "P1") }),
      expect.objectContaining({ placeId: idOf(result.places, "P1") }),
      expect.objectContaining({ placeId: idOf(result.places, "P2") }),
      expect.objectContaining({ placeId: idOf(result.places, "P2") }),
    ]);
    expect(payloads("occasion.participation_established")).toHaveLength(3);
    expect(payloads("occasion.ended")).toEqual([
      expect.objectContaining({ occasionId: idOf(result.occasions, "O2") }),
    ]);
    expect(payloads("authority.steward_appointed")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          accountId: regionOp.accountId,
          via: "grant",
        }),
        expect.objectContaining({ accountId: eventOp.accountId, via: "grant" }),
      ]),
    );
    const types = new Set(events.map((event) => event.type));
    for (const type of [
      "occasion.region_linked",
      "occasion.region_link_detached",
      "occasion.cancelled",
      "occasion.unpublished",
      "occasion.suspended",
      "region.unpublished",
      "region.suspended",
    ]) {
      expect(types).toContain(type);
    }
  });

  it("publishes fixture-level listings in their order, then seeds more onto the same state", async () => {
    const t = createTestContainer({ start: START });
    const { container } = t;
    const first = await devSeed({
      container,
      input: {
        accounts: ["op1@example.com", "owner-x@example.com"],
        operators: ["op1@example.com"],
        places: [
          {
            key: "P1",
            name: "喫茶ひだまり",
            address: AREA,
            location: NEAR,
            members: [{ appoint: "owner-x@example.com" }],
          },
          { key: "P2", name: "丸の内茶屋", address: AREA, location: NEAR },
        ],
        listings: [
          {
            place: "P2",
            key: "B",
            name: "抹茶ラテ",
            category: "食べる",
            photos: ["b.jpg"],
            state: "published",
          },
          {
            place: "P1",
            key: "A",
            name: "季節のブレンド",
            category: "食べる",
            photos: ["a.jpg"],
            state: "published",
          },
          {
            place: "P1",
            key: "C",
            name: "栗のモンブラン",
            category: "見る",
            photos: ["c.jpg"],
            state: "unpublished",
          },
        ],
      },
    });
    expect(Object.keys(first.listings)).toEqual(["B", "A", "C"]);
    const stored = (id: string | undefined) =>
      container.unitOfWorkProvider.run(async (ctx) => {
        if (id === undefined) throw new Error("no id");
        return (await ctx.listingRepository.findById(ListingId.create(id)))
          ?.entity;
      });
    const [b, a, c] = await Promise.all(
      ["B", "A", "C"].map((key) => stored(first.listings[key])),
    );
    expect(a?.placeId).toBe(first.places.P1);
    expect(b?.placeId).toBe(first.places.P2);
    const publishedAt = (listing: typeof a) =>
      listing?.publication.status === "draft"
        ? Number.NaN
        : (listing?.publication.firstPublishedAt.getTime() ?? Number.NaN);
    expect(publishedAt(b)).toBeLessThan(publishedAt(a));
    expect(publishedAt(a)).toBeLessThan(publishedAt(c));
    expect(c?.publication.status).toBe("unpublished");

    const P1 = first.places.P1 ?? "";
    const more = await devSeed({
      container,
      input: {
        accounts: ["op1@example.com", "owner-x@example.com"],
        onto: {
          operator: "op1@example.com",
          places: { P1 },
          deleteListings: [
            { id: first.listings.A ?? "", by: "owner-x@example.com" },
          ],
        },
        places: [
          { key: "P3", name: "新しい店", address: AREA, location: NEAR },
        ],
        listings: [
          {
            place: "P1",
            key: "D",
            name: "追加の掲載",
            category: "食べる",
            photos: ["d.jpg"],
            state: "published",
            by: "owner-x@example.com",
          },
        ],
      },
    });
    expect(more.accounts).toEqual(first.accounts);
    expect(more.categories).toEqual(first.categories);
    expect(Object.keys(more.places)).toEqual(["P3"]);
    expect(Object.keys(more.listings)).toEqual(["D"]);
    expect(await stored(first.listings.A)).toBeUndefined();
    const d = await stored(more.listings.D);
    expect(d?.placeId).toBe(P1);
    expect(d?.publication.status).toBe("published");
    expect(
      (await listCategories({ container })).map((category) => category.name),
    ).toEqual(["食べる", "買う", "体験", "見る"]);
    const events = (await t.storedEvents()).map((event) => event.type);
    expect(events.filter((type) => type === "listing.deleted")).toHaveLength(1);
  });

  it("seeds articles last through the editors' usecases, then more onto the same state", async () => {
    const t = createTestContainer({ start: START });
    const { container } = t;
    const first = await devSeed({
      container,
      input: {
        accounts: [
          "op1@example.com",
          "ed1@example.com",
          "ed2@example.com",
          "owner-x@example.com",
        ],
        operators: ["op1@example.com"],
        editors: ["ed1@example.com", "ed2@example.com"],
        places: [
          {
            key: "P1",
            name: "喫茶ひだまり",
            address: AREA,
            location: NEAR,
            members: [{ appoint: "owner-x@example.com" }],
            listings: [
              {
                key: "L1",
                name: "季節のフルーツサンド",
                category: "食べる",
                photos: ["sand.jpg"],
                state: "unpublished",
              },
            ],
          },
        ],
        regions: [
          {
            key: "R1",
            name: "谷中ぶらり",
            address: AREA,
            location: NEAR,
            photos: ["yanaka.jpg"],
            publication: "published",
          },
        ],
        articles: [
          {
            key: "A1",
            by: "ed1@example.com",
            title: "谷中で過ごす休日",
            body: "谷中の路地を歩いて、喫茶店でひと休み。",
            photos: ["kyujitsu-1.jpg", "kyujitsu-2.jpg"],
            showcases: [{ listing: "L1" }, { place: "P1" }, { region: "R1" }],
            state: "published",
          },
          {
            key: "A2",
            by: "ed2@example.com",
            title: "根津の古書店めぐり",
            body: "根津には古書店が点在しています。",
            state: "draft",
          },
          {
            key: "A3",
            by: "ed2@example.com",
            title: "夏の夜のあかり",
            body: "灯り",
            photos: ["akari-photo.jpg"],
            state: "unpublished",
            revisions: [
              { by: "ed1@example.com", body: "灯りに照らされた谷中の夜。" },
            ],
          },
        ],
      },
    });
    expect(Object.keys(first.articles)).toEqual(["A1", "A2", "A3"]);
    const stored = (id: string | undefined) =>
      container.unitOfWorkProvider.run(async (ctx) => {
        if (id === undefined) throw new Error("no id");
        return (await ctx.articleRepository.findById(ArticleId.create(id)))
          ?.entity;
      });
    const [a1, a2, a3] = await Promise.all(
      ["A1", "A2", "A3"].map((key) => stored(first.articles[key])),
    );
    expect(a1?.publication.status).toBe("published");
    expect(a1?.content.photos.items).toHaveLength(2);
    expect(a1?.content.showcases).toEqual([
      { kind: "listing", id: first.listings.L1 },
      { kind: "place", id: first.places.P1 },
      { kind: "region", id: first.regions.R1 },
    ]);
    expect(a2?.publication.status).toBe("draft");
    expect(a2?.content.photos.items).toEqual([]);
    expect(a3?.publication.status).toBe("unpublished");
    expect(a3?.content.body).toBe("灯りに照らされた谷中の夜。");
    const firstPublished = (article: typeof a1) =>
      article?.publication.status === "published" ||
      article?.publication.status === "unpublished"
        ? (article.publication.firstPublishedAt?.getTime() ?? Number.NaN)
        : Number.NaN;
    expect(firstPublished(a1)).toBeLessThan(firstPublished(a3));
    const L1 = first.listings.L1 ?? "";
    const listing = await container.unitOfWorkProvider.run((ctx) =>
      ctx.listingRepository.findById(ListingId.create(L1)),
    );
    expect(listing?.entity.publication.status).toBe("unpublished");

    const more = await devSeed({
      container,
      input: {
        accounts: ["op1@example.com", "ed1@example.com"],
        onto: {
          operator: "op1@example.com",
          places: { P1: first.places.P1 ?? "" },
          listings: { L1 },
          unpublishArticles: [
            { id: first.articles.A1 ?? "", by: "ed1@example.com" },
          ],
        },
        articles: [
          {
            key: "B1",
            by: "ed1@example.com",
            title: "朝の喫茶",
            body: "朝の喫茶店。",
            photos: ["asa.jpg"],
            showcases: [{ place: "P1" }, { listing: "L1" }],
            state: "published",
          },
        ],
      },
    });
    expect(Object.keys(more.articles)).toEqual(["B1"]);
    expect((await stored(first.articles.A1))?.publication.status).toBe(
      "unpublished",
    );
    const b1 = await stored(more.articles.B1);
    expect(b1?.publication.status).toBe("published");
    expect(b1?.content.showcases.map((ref) => ref.id)).toEqual([
      first.places.P1,
      L1,
    ]);
  });

  it("refuses a representative region for a place without a steward", async () => {
    const { container } = createTestContainer({ start: START });
    await expect(
      devSeed({
        container,
        input: {
          ...AREA_FIXTURE,
          affiliations: [
            { place: "P2", regions: ["R1"], representative: "R1" },
          ],
          occasions: [],
        },
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("adds the categories beyond the initial four", async () => {
    const { container } = createTestContainer({ start: START });
    await devSeed({
      container,
      input: {
        accounts: ["op1@example.com"],
        operators: ["op1@example.com"],
        categories: ["食べる", "買う", "体験", "見る", "廃止テスト1"],
      },
    });
    expect(
      (await listCategories({ container })).map((category) => category.name),
    ).toEqual(["食べる", "買う", "体験", "見る", "廃止テスト1"]);
  });

  it("refuses an acting account the fixture does not list", async () => {
    const { container } = createTestContainer({ start: START });
    await expect(
      devSeed({
        container,
        input: {
          accounts: ["op1@example.com"],
          operators: ["op1@example.com"],
          places: [
            {
              key: "P1",
              name: "喫茶ひだまり",
              address: { postalCode: "1000004", rest: "1" },
              location: { latitude: 35.686, longitude: 139.766 },
              members: [
                { invite: "user-a@example.com", by: "ghost@example.com" },
              ],
            },
          ],
        },
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("is refused without the development tools", async () => {
    const { container } = createTestContainer({ start: START });
    await expect(
      devSeed({
        container: {
          ...container,
          runtime: { ...container.runtime, devTools: false },
        },
        input: FIXTURE,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(await listCategories({ container })).toEqual([]);
  });
});

describe("seedPhotoPng", () => {
  it("draws a photo the inspector accepts, the same bytes for the same label", async () => {
    const inspector = new StructuralPhotoInspector();
    const photo = seedPhotoPng("hidamari-1.jpg");
    expect(await inspector.inspect(photo)).toEqual({
      kind: "photo",
      format: "image/png",
    });
    expect(seedPhotoPng("hidamari-1.jpg")).toEqual(photo);
    expect(seedPhotoPng("hidamari-2.jpg")).not.toEqual(photo);
    expect(
      await inspector.inspect(seedPhotoPng("日本語?", { width: 3, height: 2 })),
    ).toMatchObject({ kind: "photo" });
  });
});
