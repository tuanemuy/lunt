// Seeds a manual-test document's test data into a running local server:
//   node apps/web/scripts/seedManualTest.mjs <document> [--port 3000]
// posts scripts/manual-test-fixtures/<document>.json to POST /__dev/seed
// (DEV_TOOLS=1, an empty state) and writes the ids it answers to
// .wrangler/seed-<document>-<port>.json. Onto that seeded state:
//   ... <document> --add <set>      a listing, article or relation set of sets/<document>.json
//   ... <document> --remove <set>   deletes the listings (unpublishes the articles) --add <set> created
//   ... <document> --volume <N>     N more places, each with listings
// In two steps, for a check made before any article exists:
//   ... <document> --articles hold  the document without its articles
//   ... <document> --articles add   then its articles onto that state
// See docs/manual_test.md.
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { fileURLToPath } from "node:url";

const fixturesDir = new URL("./manual-test-fixtures/", import.meta.url);
const documents = readdirSync(fixturesDir)
  .filter((name) => name.endsWith(".json"))
  .map((name) => name.slice(0, -".json".length))
  .sort();

const usage = () => {
  console.error(
    `Usage: node apps/web/scripts/seedManualTest.mjs <${documents.join("|")}> [--add <set> | --remove <set> | --volume <N> | --articles <hold|add>] [--port 3000]`,
  );
  process.exit(2);
};

const args = process.argv.slice(2);
const options = {};
const positional = [];
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg.startsWith("--")) {
    const value = args[i + 1];
    if (value === undefined) usage();
    options[arg.slice(2)] = value;
    i++;
  } else {
    positional.push(arg);
  }
}
const port = options.port ?? "3000";
const [document] = positional;
const modes = ["add", "remove", "volume", "articles"].filter(
  (m) => m in options,
);
const unknown = Object.keys(options).filter(
  (o) => o !== "port" && !modes.includes(o),
);
if (
  document === undefined ||
  !documents.includes(document) ||
  positional.length !== 1 ||
  modes.length > 1 ||
  unknown.length > 0 ||
  ("articles" in options && !["hold", "add"].includes(options.articles))
) {
  usage();
}

const readJson = (url) => JSON.parse(readFileSync(url, "utf8"));
const fixture = readJson(new URL(`${document}.json`, fixturesDir));
const outDir = new URL("../.wrangler/", import.meta.url);
const outFile = (suffix) =>
  new URL(`seed-${document}-${port}${suffix}.json`, outDir);
const save = (suffix, ids) => {
  mkdirSync(outDir, { recursive: true });
  const file = outFile(suffix);
  writeFileSync(file, `${JSON.stringify(ids, null, 2)}\n`);
  console.log(`Saved to ${fileURLToPath(file)}`);
};
const baseIds = () => {
  const file = outFile("");
  if (!existsSync(file)) {
    console.error(
      `${fileURLToPath(file)} is missing: seed ${document} on port ${port} first`,
    );
    process.exit(1);
  }
  return readJson(file);
};

const url = `http://localhost:${port}/__dev/seed`;
async function post(body) {
  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (error) {
    console.error(`Could not reach ${url}: is the server running?`, error);
    process.exit(1);
  }
  const text = await response.text();
  if (!response.ok) {
    console.error(`${url} answered ${response.status}: ${text}`);
    process.exit(1);
  }
  return JSON.parse(text);
}

const pages = {
  places: "places",
  listings: "listings",
  regions: "regions",
  occasions: "events",
  articles: "articles",
};
const printPages = (ids) => {
  for (const [kind, path] of Object.entries(pages)) {
    for (const [key, id] of Object.entries(ids[kind] ?? {})) {
      console.log(`${key}: http://localhost:${port}/${path}/${id}`);
    }
  }
};

const [operator] = fixture.operators;
// Everything an article may showcase, by the keys the base seed answered.
const ontoBase = (base) => ({
  operator,
  places: base.places ?? {},
  listings: base.listings ?? {},
  regions: base.regions ?? {},
  occasions: base.occasions ?? {},
});

if ("add" in options || "remove" in options) {
  const name = options.add ?? options.remove;
  const setsFile = new URL(`sets/${document}.json`, fixturesDir);
  const sets = existsSync(setsFile) ? readJson(setsFile) : {};
  const set = sets[name];
  if (set === undefined) {
    console.error(
      `${document} has no set ${name} (sets: ${Object.keys(sets).join(", ") || "none"})`,
    );
    process.exit(2);
  }
  const suffix = `-set-${name}`;
  const relations =
    set.affiliations !== undefined || set.participations !== undefined;
  if ("remove" in options && relations) {
    console.error(
      `${name} cannot be removed: reset the state and seed ${document} again`,
    );
    process.exit(2);
  }
  if (relations) {
    const participations = set.participations ?? [];
    await post({
      accounts: [operator, ...new Set(participations.map((p) => p.by))],
      onto: ontoBase(baseIds()),
      affiliations: set.affiliations ?? [],
      participations,
    });
    console.log(
      `${name}: ${(set.affiliations ?? []).length} affiliations, ${participations.length} participations`,
    );
  } else if ("add" in options && set.articles !== undefined) {
    const ids = await post({
      accounts: [operator, set.by],
      onto: ontoBase(baseIds()),
      articles: set.articles.map((article) => ({ ...article, by: set.by })),
    });
    printPages({ articles: ids.articles });
    console.log(`${name}: ${Object.keys(ids.articles).length} articles`);
    save(suffix, { by: set.by, articles: ids.articles });
  } else if ("add" in options) {
    const base = baseIds();
    const listings = Array.from({ length: set.count }, (_, i) => {
      const n = String(i + 1);
      const title = set.name
        .replace("{nnn}", n.padStart(3, "0"))
        .replace("{n}", n);
      return {
        place: set.place,
        key: title,
        name: title,
        category: set.category,
        photos: [`${name}-${n.padStart(3, "0")}.jpg`],
        state: "published",
        by: set.by,
      };
    });
    const ids = await post({
      accounts: [operator, set.by],
      onto: { operator, places: { [set.place]: base.places[set.place] } },
      listings,
    });
    console.log(`${name}: ${Object.keys(ids.listings).length} listings`);
    save(suffix, { by: set.by, listings: ids.listings });
  } else {
    const file = outFile(suffix);
    if (!existsSync(file)) {
      console.error(`${fileURLToPath(file)} is missing: nothing to remove`);
      process.exit(1);
    }
    const added = readJson(file);
    const articleIds = Object.values(added.articles ?? {});
    const listingIds = Object.values(added.listings ?? {});
    await post({
      accounts: [operator, added.by],
      onto: {
        operator,
        deleteListings: listingIds.map((id) => ({ id, by: added.by })),
        unpublishArticles: articleIds.map((id) => ({ id, by: added.by })),
      },
    });
    rmSync(file);
    console.log(
      articleIds.length > 0
        ? `${name}: unpublished ${articleIds.length} articles (articles are never deleted)`
        : `${name}: deleted ${listingIds.length} listings`,
    );
  }
} else if ("volume" in options) {
  const count = Number(options.volume);
  if (!Number.isInteger(count) || count < 1 || count > 2000) usage();
  const base = baseIds();
  // Real town centres of the development area sample (public/area-sample),
  // so each address, its town and the pin agree.
  const towns = [
    ["100-0004", "大手町", 35.6867, 139.765],
    ["100-0005", "丸の内", 35.6812, 139.764],
    ["100-0006", "有楽町", 35.675, 139.763],
    ["101-0041", "神田須田町", 35.6955, 139.7695],
    ["101-0051", "神田神保町", 35.696, 139.758],
    ["101-0021", "外神田", 35.7005, 139.771],
    ["102-0083", "麹町", 35.6845, 139.738],
    ["104-0061", "銀座", 35.6717, 139.765],
    ["103-0027", "日本橋", 35.683, 139.7745],
    ["103-0013", "日本橋人形町", 35.6865, 139.7825],
    ["104-0045", "築地", 35.6655, 139.7707],
    ["104-0032", "八丁堀", 35.675, 139.778],
    ["104-0052", "月島", 35.6645, 139.7825],
    ["113-0034", "湯島", 35.706, 139.769],
    ["113-0033", "本郷", 35.708, 139.76],
    ["113-0031", "根津", 35.719, 139.764],
    ["113-0022", "千駄木", 35.725, 139.762],
    ["110-0001", "谷中", 35.7262, 139.7668],
    ["110-0005", "上野", 35.709, 139.774],
    ["111-0032", "浅草", 35.7148, 139.7967],
    ["111-0051", "蔵前", 35.703, 139.791],
    ["530-0001", "梅田", 34.7025, 135.4959],
    ["530-0013", "茶屋町", 34.706, 135.499],
    ["530-0016", "中崎", 34.7075, 135.506],
    ["530-0047", "西天満", 34.698, 135.505],
  ];
  const categories = fixture.categories ?? ["食べる", "買う", "体験", "見る"];
  const regions = (fixture.regions ?? []).filter(
    (r) => r.publication === "published" && !r.suspended && r.location,
  );
  // Deterministic jitter, so a rerun on a fresh state draws the same map.
  let seed = 20260930;
  const random = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  const km = (a, b) =>
    Math.hypot(
      (a.latitude - b.latitude) * 111,
      (a.longitude - b.longitude) * 91,
    );
  const places = [];
  const affiliations = [];
  for (let i = 1; i <= count; i++) {
    const n = String(i).padStart(4, "0");
    const [postalCode, town, lat, lng] = towns[(i - 1) % towns.length];
    const location = {
      latitude: Number((lat + (random() - 0.5) * 0.006).toFixed(6)),
      longitude: Number((lng + (random() - 0.5) * 0.007).toFixed(6)),
    };
    const key = `V${n}`;
    places.push({
      key,
      name: `ボリューム確認 店舗${n}（${town}）`,
      address: { postalCode, rest: `${(i % 9) + 1}-${(i % 17) + 1}-${i}` },
      location,
      ...(i % 3 === 0 ? {} : { photos: [`volume-place-${n}.jpg`] }),
      listings: Array.from({ length: (i % 2) + 1 }, (_, j) => ({
        key: `${key}-L${j + 1}`,
        name: `ボリューム確認 掲載${n}-${j + 1}`,
        category: categories[(i + j) % categories.length],
        photos: [`volume-listing-${n}-${j + 1}.jpg`],
        state: "published",
      })),
    });
    const nearest = regions
      .map((r) => ({ key: r.key, distance: km(r.location, location) }))
      .filter((r) => r.distance <= 1.5)
      .sort((a, b) => a.distance - b.distance)[0];
    if (nearest !== undefined) {
      affiliations.push({ place: key, regions: [nearest.key] });
    }
  }
  const batch = 50;
  const result = { places: {}, listings: {} };
  const started = Date.now();
  for (let from = 0; from < places.length; from += batch) {
    const chunk = places.slice(from, from + batch);
    const keys = new Set(chunk.map((p) => p.key));
    const ids = await post({
      accounts: [operator],
      onto: { operator, regions: base.regions ?? {} },
      places: chunk,
      affiliations: affiliations.filter((a) => keys.has(a.place)),
    });
    Object.assign(result.places, ids.places);
    Object.assign(result.listings, ids.listings);
    console.log(
      `volume: ${Object.keys(result.places).length}/${count} places (${Math.round((Date.now() - started) / 1000)}s)`,
    );
  }
  console.log(
    `volume: ${Object.keys(result.places).length} places, ${Object.keys(result.listings).length} listings, ${affiliations.length} affiliations`,
  );
  save("-volume", result);
} else if (options.articles === "hold") {
  const { articles: _held, ...held } = fixture;
  const ids = await post(held);
  console.log(JSON.stringify(ids, null, 2));
  printPages(ids);
  save("", ids);
} else if (options.articles === "add") {
  const base = baseIds();
  const articles = fixture.articles ?? [];
  const ids = await post({
    accounts: [operator, ...new Set(articles.map((article) => article.by))],
    onto: ontoBase(base),
    articles,
  });
  printPages({ articles: ids.articles });
  save("", { ...base, articles: ids.articles });
} else {
  const ids = await post(fixture);
  console.log(JSON.stringify(ids, null, 2));
  printPages(ids);
  save("", ids);
}
