import { readdirSync, readFileSync } from "node:fs";
import { AssetAreaCatalog } from "@repo/core/adapters/area/assetAreaCatalog";
import { parseJapanPostCsv } from "@repo/core/adapters/area/japanPost";
import { InMemoryAreaAssets } from "@repo/core/adapters/area/testing/inMemoryAreaAssets";
import { createTestContainer } from "@repo/core/application/__tests__/testContainer";
import { devSeed } from "@repo/core/application/dev/devSeed";
import { listCategories } from "@repo/core/application/listing/listCategories";
import { describe, expect, it } from "vitest";
import { handleDevSeedRequest, seedFixtureSchema } from "../devSeed";

const post = (body: string) =>
  new Request("http://localhost:3000/__dev/seed", { method: "POST", body });

const FIXTURE = {
  accounts: ["op1@example.com", "owner-x@example.com"],
  operators: ["op1@example.com"],
  categories: ["カフェ"],
  places: [
    {
      key: "P1",
      name: "喫茶ひだまり",
      address: { postalCode: "1000004", rest: "2-1-1" },
      location: { latitude: 35.686, longitude: 139.766 },
      photos: ["hidamari-1.jpg"],
      members: [{ appoint: "owner-x@example.com" }],
      listings: [
        {
          key: "L1",
          name: "ブレンドコーヒー",
          category: "カフェ",
          photos: ["blend.jpg"],
          state: "published",
        },
      ],
    },
  ],
};

describe("handleDevSeedRequest", () => {
  it("seeds the posted fixture and answers the ids it created", async () => {
    const { container } = createTestContainer();
    const response = await handleDevSeedRequest(post(JSON.stringify(FIXTURE)), {
      devTools: true,
      seed: (fixture) => devSeed({ container, input: fixture }),
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<
      string,
      Record<string, string>
    >;
    expect(Object.keys(body.accounts ?? {})).toEqual(FIXTURE.accounts);
    expect(Object.keys(body.places ?? {})).toEqual(["P1"]);
    expect(Object.keys(body.listings ?? {})).toEqual(["L1"]);
    expect(
      (await listCategories({ container })).map((category) => category.name),
    ).toEqual(["カフェ"]);
  });

  it("answers a failed usecase with its serialized error and status", async () => {
    const { container } = createTestContainer();
    const response = await handleDevSeedRequest(
      post(JSON.stringify({ ...FIXTURE, accounts: ["owner-x@example.com"] })),
      {
        devTools: true,
        seed: (fixture) => devSeed({ container, input: fixture }),
      },
    );
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      error: { kind: "notFound" },
    });
  });

  it("refuses a body that is not a fixture", async () => {
    const seed = async () => {
      throw new Error("not expected");
    };
    const invalid = await handleDevSeedRequest(post("{"), {
      devTools: true,
      seed,
    });
    expect(invalid.status).toBe(400);
    const wrongShape = await handleDevSeedRequest(
      post(JSON.stringify({ ...FIXTURE, operators: [] })),
      { devTools: true, seed },
    );
    expect(wrongShape.status).toBe(400);
    const [p1] = FIXTURE.places;
    const duplicateKeys = await handleDevSeedRequest(
      post(JSON.stringify({ ...FIXTURE, places: [p1, p1] })),
      { devTools: true, seed },
    );
    expect(duplicateKeys.status).toBe(400);
  });

  it("takes a fixture onto an earlier seed, but not one that also opens the service", () => {
    const onto = {
      accounts: ["op1@example.com"],
      onto: {
        operator: "op1@example.com",
        places: { S1: "place-1" },
        deleteListings: [{ id: "listing-1", by: "op1@example.com" }],
      },
      listings: [
        {
          place: "S1",
          key: "X1",
          name: "テスト用の掲載 X1",
          category: "食べる",
          state: "published",
        },
      ],
    };
    expect(seedFixtureSchema.safeParse(onto).success).toBe(true);
    expect(
      seedFixtureSchema.safeParse({ ...onto, operators: ["op1@example.com"] })
        .success,
    ).toBe(false);
    expect(
      seedFixtureSchema.safeParse({ ...onto, places: [FIXTURE.places[0]] })
        .success,
    ).toBe(true);
    expect(
      seedFixtureSchema.safeParse({
        ...onto,
        places: [{ ...FIXTURE.places[0], key: "S1" }],
      }).success,
    ).toBe(false);
  });

  describe("every manual-test fixture", () => {
    const dir = new URL(
      "../../../scripts/manual-test-fixtures/",
      import.meta.url,
    );
    const files = readdirSync(dir).filter((name) => name.endsWith(".json"));
    const read = (name: string): unknown =>
      JSON.parse(readFileSync(new URL(name, dir), "utf8"));

    it("is one of the twelve documents' fixtures", () => {
      expect(files).toHaveLength(12);
    });

    it.each(
      readdirSync(new URL("sets/", dir)).filter((name) =>
        name.endsWith(".json"),
      ),
    )("sets/%s adds listings to one of its document's places", (name) => {
      const places = new Set(
        seedFixtureSchema.parse(read(name)).places?.map((place) => place.key),
      );
      const sets = Object.values(
        read(`sets/${name}`) as Record<
          string,
          { place: string; by: string; count: number; name: string }
        >,
      );
      expect(sets.length).toBeGreaterThan(0);
      for (const set of sets) {
        expect(places).toContain(set.place);
        expect(set.count).toBeLessThanOrEqual(200);
        expect(set.name).toMatch(/\{n{1,3}\}/);
      }
    });

    it.each(files)("%s is a fixture and seeds an empty state", async (name) => {
      const parsed = seedFixtureSchema.safeParse(read(name));
      expect(parsed.error, name).toBeUndefined();
      if (!parsed.success) return;
      const sample = parseJapanPostCsv(
        readFileSync(
          new URL("../../../scripts/areaSample.csv", import.meta.url),
          "utf8",
        ),
      );
      const { container } = createTestContainer();
      const areaCatalog = new AssetAreaCatalog(
        InMemoryAreaAssets.fromRows(sample, "/area"),
        { basePaths: ["/area"] },
      );
      const result = await devSeed({
        container: { ...container, areaCatalog },
        input: parsed.data,
      });
      expect(Object.keys(result.places)).toEqual(
        (parsed.data.places ?? []).map((place) => place.key),
      );
      expect(Object.keys(result.regions)).toEqual(
        (parsed.data.regions ?? []).map((region) => region.key),
      );
      expect(Object.keys(result.occasions)).toEqual(
        (parsed.data.occasions ?? []).map((occasion) => occasion.key),
      );
    });
  });

  it("does not exist while the development tools are off", async () => {
    const response = await handleDevSeedRequest(post(JSON.stringify(FIXTURE)), {
      devTools: false,
      seed: async () => {
        throw new Error("not expected");
      },
    });
    expect(response.status).toBe(404);
  });
});
