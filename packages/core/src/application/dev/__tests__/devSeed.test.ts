import { StructuralPhotoInspector } from "@repo/core/adapters/photos/structuralPhotoInspector";
import { createTestContainer } from "@repo/core/application/__tests__/testContainer";
import { ForbiddenError, NotFoundError } from "@repo/core/application/errors";
import { LocalDate } from "@repo/core/domain/common/localDate";
import { describe, expect, it } from "vitest";
import { invitationEmails, stewardIds } from "../../authority/__tests__/kit";
import { getManagedListing } from "../../listing/getManagedListing";
import { listCategories } from "../../listing/listCategories";
import { getManagedPlace } from "../../place/getManagedPlace";
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
