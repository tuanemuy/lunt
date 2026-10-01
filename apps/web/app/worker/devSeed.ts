import type {
  DevSeedResult,
  SeedFixture,
} from "@repo/core/application/dev/devSeed";
import { z } from "zod";
import {
  httpStatusFor,
  redactForClient,
  serializeError,
} from "../presentation/errorResponse";

export const DEV_SEED_PATH = "/__dev/seed";

const email = z.string().min(1).max(320);
const text = z.string().max(2000);
const seedDate = z
  .string()
  .regex(/^(?:\d{4}-\d{2}-\d{2}|today(?:[+-]\d{1,5})?)$/);
const labels = z.array(z.string().min(1).max(100)).max(20);

const offering = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("none") }).strict(),
  z
    .object({
      kind: z.literal("period"),
      start: seedDate.nullable(),
      end: seedDate.nullable(),
    })
    .strict(),
  z
    .object({ kind: z.literal("dates"), dates: z.array(seedDate).max(100) })
    .strict(),
]);

const memberStep = z.union([
  z.object({ appoint: email }).strict(),
  z
    .object({ invite: email, by: email, accept: z.boolean().optional() })
    .strict(),
  z.object({ resign: email }).strict(),
]);

const key = z.string().min(1).max(100);

const listing = z
  .object({
    key,
    name: text.nullable(),
    description: text.nullable().optional(),
    category: text.nullable().optional(),
    photos: labels.optional(),
    offering: offering.optional(),
    offeringAfterPublish: offering.optional(),
    state: z.enum(["draft", "published", "unpublished", "ended"]),
    suspended: z.boolean().optional(),
    by: email.optional(),
  })
  .strict();

const address = z
  .object({
    postalCode: z.string().min(1).max(20),
    town: z.string().max(200).optional(),
    rest: text,
  })
  .strict();

const location = z
  .object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
  })
  .strict();

const members = z.array(memberStep).max(50).optional();

const place = z
  .object({
    key,
    name: text,
    description: text.nullable().optional(),
    businessHours: text.nullable().optional(),
    contact: text.nullable().optional(),
    address,
    location,
    photos: labels.optional(),
    operatingStatus: z
      .enum(["open", "temporarilyClosed", "permanentlyClosed"])
      .optional(),
    members,
    listings: z.array(listing).max(50).optional(),
    suspended: z.boolean().optional(),
  })
  .strict();

const content = {
  key,
  name: text,
  address: address.nullable().optional(),
  location: location.nullable().optional(),
  photos: labels.optional(),
  description: text.nullable().optional(),
  tagline: text.nullable().optional(),
  publication: z.enum(["draft", "published", "unpublished"]),
  suspended: z.boolean().optional(),
  members,
};

const region = z.object(content).strict();

const affiliation = z
  .object({
    place: key,
    regions: z.array(key).min(1).max(50),
    representative: key.optional(),
  })
  .strict();

const participation = {
  place: key,
  listings: z.array(key).max(50).optional(),
  dates: z.array(seedDate).max(100).optional(),
};

const occasion = z
  .object({
    ...content,
    period: z
      .object({ start: seedDate, end: seedDate })
      .strict()
      .nullable()
      .optional(),
    cancelled: z.boolean().optional(),
    regionLinks: z
      .array(
        z.object({ region: key, detached: z.boolean().optional() }).strict(),
      )
      .max(50)
      .optional(),
    participations: z
      .array(z.object(participation).strict())
      .max(100)
      .optional(),
  })
  .strict();

const articleContent = {
  title: z.string().max(200).nullable().optional(),
  body: z.string().max(25_000).nullable().optional(),
  photos: labels.optional(),
  showcases: z
    .array(
      z.union([
        z.object({ listing: key }).strict(),
        z.object({ place: key }).strict(),
        z.object({ region: key }).strict(),
        z.object({ occasion: key }).strict(),
      ]),
    )
    .max(50)
    .optional(),
};

const article = z
  .object({
    ...articleContent,
    key,
    by: email,
    state: z.enum(["draft", "published", "unpublished"]),
    revisions: z
      .array(z.object({ ...articleContent, by: email.optional() }).strict())
      .max(10)
      .optional(),
  })
  .strict();

const unique = (keys: readonly string[]): boolean =>
  new Set(keys).size === keys.length;

const id = z.string().min(1).max(100);
const keyedIds = z.record(key, id).optional();

const contents = {
  accounts: z.array(email).max(200),
  places: z.array(place).max(100).optional(),
  listings: z
    .array(listing.extend({ place: key }))
    .max(200)
    .optional(),
  regions: z.array(region).max(50).optional(),
  affiliations: z.array(affiliation).max(100).optional(),
  occasions: z.array(occasion).max(50).optional(),
  participations: z
    .array(z.object({ ...participation, occasion: key, by: email }).strict())
    .max(100)
    .optional(),
  articles: z.array(article).max(50).optional(),
};

const fresh = z
  .object({
    ...contents,
    operators: z
      .tuple([email], email)
      .refine((list) => list.length <= 20, "At most 20 operators"),
    editors: z.array(email).max(20).optional(),
    categories: z.array(z.string().min(1).max(100)).min(1).max(50).optional(),
  })
  .strict();

const onto = z
  .object({
    ...contents,
    onto: z
      .object({
        operator: email,
        places: keyedIds,
        regions: keyedIds,
        listings: keyedIds,
        occasions: keyedIds,
        deleteListings: z
          .array(z.object({ id, by: email.optional() }).strict())
          .max(200)
          .optional(),
        unpublishArticles: z
          .array(z.object({ id, by: email }).strict())
          .max(50)
          .optional(),
      })
      .strict(),
  })
  .strict();

/** The transport shape of `SeedFixture`; bounds keep one request small. */
export const seedFixtureSchema = z.union([fresh, onto]).refine((fixture) => {
  const places = fixture.places ?? [];
  return (
    unique([
      ...places.map((p) => p.key),
      ...Object.keys(("onto" in fixture && fixture.onto.places) || {}),
    ]) &&
    unique([
      ...(fixture.regions ?? []).map((r) => r.key),
      ...Object.keys(("onto" in fixture && fixture.onto.regions) || {}),
    ]) &&
    unique([
      ...places.flatMap((p) => p.listings ?? []).map((l) => l.key),
      ...(fixture.listings ?? []).map((l) => l.key),
      ...Object.keys(("onto" in fixture && fixture.onto.listings) || {}),
    ]) &&
    unique([
      ...(fixture.occasions ?? []).map((o) => o.key),
      ...Object.keys(("onto" in fixture && fixture.onto.occasions) || {}),
    ]) &&
    unique((fixture.articles ?? []).map((a) => a.key))
  );
}, "Place, listing, region, occasion and article keys must each be unique") satisfies z.ZodType<SeedFixture>;

/**
 * `POST /__dev/seed` — the development tool that seeds a manual-test
 * document's data (`devSeed`; `docs/manual_test.md` 「Seeding the test
 * data」). Body: a `SeedFixture` as JSON. Answers the ids it created
 * (`DevSeedResult`), a failed usecase's serialized error with its HTTP
 * status, or 400 for a body that is not a fixture. Not found while the
 * development tools are off, as every `/__dev/*` route.
 */
export async function handleDevSeedRequest(
  request: Request,
  deps: Readonly<{
    devTools: boolean;
    seed: (fixture: SeedFixture) => Promise<DevSeedResult>;
  }>,
): Promise<Response> {
  if (!deps.devTools || request.method !== "POST") {
    return new Response("Not Found", { status: 404 });
  }
  let body: unknown;
  try {
    body = JSON.parse(await request.text()) as unknown;
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }
  const parsed = seedFixtureSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.message }, { status: 400 });
  }
  try {
    return Response.json(await deps.seed(parsed.data));
  } catch (error) {
    console.error("[dev/seed] failed", error);
    const serialized = serializeError(error);
    return Response.json(
      { error: redactForClient(serialized) },
      { status: httpStatusFor(serialized) },
    );
  }
}
