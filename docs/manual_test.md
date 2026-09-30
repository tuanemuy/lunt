# Running the manual tests locally

`spec/manual-tests/*.md` are browser procedures. Their preconditions ask for a test environment where mail and the external login can be observed, time can be moved forward, and the daily jobs run only when a step says so. The local development server provides all of it while `DEV_TOOLS=1`; none of it exists in a deployed configuration.

## Set up

1. Copy the settings: `cp apps/web/.dev.vars.manual-test.example apps/web/.dev.vars` (gitignored). They satisfy the 設定値 each procedure states — send cap M ≥ 20, login link/code lifetime T ≥ 4 minutes, wrong-code limit N ≥ 2, the review period P ≥ 2 days and D ≤ 8 days — and switch the automatic daily jobs off.
2. Start from an empty state: `pnpm dev:reset && pnpm dev` (http://localhost:3000).
3. Open the service: the first operator logs in once, then `POST /__ops/operators/establish` (`docs/runtime_cloudflare_do.md` 「Opening the service」).
4. Record the settings the procedures ask for from `.dev.vars` (and `apps/web/wrangler.jsonc` for anything not overridden).

## Seeding the test data

Instead of building a document's 「テストデータ」 by hand, seed it into an empty state while the server runs:

```sh
LUNT_STATE_DIR=.wrangler/state-b pnpm --filter @repo/web dev:reset   # empty state
node apps/web/scripts/seedManualTest.mjs shop --port 3102            # shop | listing | application | moderation | operation | membership | account | region | event | discover | explore | keep
```

The script posts `apps/web/scripts/manual-test-fixtures/<document>.json` to `POST /__dev/seed` (a development tool: not found while `DEV_TOOLS` is off or the host is not local). It prints the ids it created, the `/places/<id>`, `/listings/<id>`, `/regions/<id>` and `/events/<id>` URLs, and saves them to `apps/web/.wrangler/seed-<document>-<port>.json`. It replaces the opening procedure (step 3 above): the first operator and the initial categories are part of the seed. Run it once per empty state; it is not idempotent.

`devSeed` (`packages/core/src/application/dev/devSeed.ts`) goes through the product's usecases as the account the procedure names, so events, notifications and invariants are real: accounts as a development login; the first operator by `establishFirstOperator`, other operators and editors by `grantRole`; categories by `provisionInitialCategories` / `renameCategory` / `addCategory` / `retireCategory`; places by `registerPlaceByProxy` as the first operator; stewards as `/__dev/stewards` does (claim approval) or through `inviteMember` / `acceptInvitation` / `resignStewardship`; listings by `createListingDraft` / `publishListing` and the transition usecases as their manager (the first current steward, or the operator standing in for an absent one); regions and occasions by `registerRegion` / `registerOccasion` as the first operator, their stewards by `grantStewardship` (then invitations as for places), and their publication, cancellation and region links (`linkRegion` / `detachRegionLink`) as their manager; a place's representative region by `chooseRepresentativeRegion` as its first steward; suspensions by the operator. Affiliations, and participations of places with a steward, are made only by approving applications, which arrive with S3B: until then the seed makes them through the development paths described below. A participation of a place without a steward is `addParticipationDirectly` by the occasion's manager. States that would stand in the way of later steps — unpublished, ended or suspended listings, suspended places, unpublished or suspended regions, cancelled, unpublished or suspended occasions, detached links — are applied after everything else, and the seed ends with one run of `recordEndedOccasions`, as the daily job would have recorded the occasions already over. Records the product orders by time (first-affiliated order, participants, links) keep the fixture's order. Photos are PNGs drawn with their label (`seedPhotoPng`), registered with consent by the account that uses them and stored like any upload; every mention of a label registers a new photo from the same bytes.

### Additional sets and volume

Some test cases publish extra listings in their own preparation and delete them afterwards. Onto a document seeded on the same port:

```sh
node apps/web/scripts/seedManualTest.mjs discover --add X --port 3102      # publishes the set, saves ids to seed-discover-3102-set-X.json
node apps/web/scripts/seedManualTest.mjs discover --remove X --port 3102   # deletes what --add X created
node apps/web/scripts/seedManualTest.mjs discover --volume 300 --port 3102 # 300 more places for map clusters and scrolling
```

The sets are `manual-test-fixtures/sets/<document>.json` (`{n}` / `{nnn}` in the name is the number, plain or zero-padded): discover X (「テスト用の掲載 X1」〜「X8」), Z (「続き確認 001」〜「086」), W (「検索続き 001」〜「101」); explore X; keep bulk (「一括確認 001」〜「101」, TC-KEP-046). Each is created and deleted by S1's steward (店舗管理者K). `--volume N` registers N places without a steward (「ボリューム確認 店舗NNNN（町域）」) spread over 25 towns of the development area sample — central Tokyo (千代田区・中央区・文京区・台東区) and 大阪市北区 — with real town centres and a few hundred metres of jitter, two of three with a photo, each with one or two published listings (「ボリューム確認 掲載NNNN-n」, categories in turn), each affiliated with the nearest published region of the document within 1.5 km. It is sent 50 places per request (about 3.5 s each locally: 300 places, 450 listings in about 22 s) and is not removable: reset the state instead. The volume changes what the feed, map, search and region lists show, so add it only for the checks that need it.

### Fixture format

```jsonc
{
  "accounts": ["owner-x@example.com", "operator1@example.com"],   // created in order
  "operators": ["operator1@example.com"],   // the first is established, the rest granted
  "editors": [],
  "categories": ["食べる", "買う", "体験", "見る"],   // the active categories, exactly (default: the initial four)
  "places": [{
    "key": "S1", "name": "喫茶ひだまり",
    "description": null, "businessHours": null, "contact": null,
    "address": { "postalCode": "110-0001", "town": "谷中", "rest": "2-1-1" },   // town optional when the code has one
    "location": { "latitude": 35.7262, "longitude": 139.7668 },
    "photos": ["hidamari-1.jpg"],
    "operatingStatus": "open",   // | temporarilyClosed | permanentlyClosed
    "members": [   // applied in order
      { "appoint": "owner-x@example.com" },
      { "invite": "owner-y@example.com", "by": "owner-x@example.com", "accept": true },   // without accept: stays pending
      { "resign": "owner-x@example.com" }
    ],
    "listings": [{
      "key": "L1", "name": "ブレンドコーヒー", "description": null, "category": "食べる",
      "photos": ["blend.jpg"],
      "offering": { "kind": "dates", "dates": ["today+7", "today+14"] },   // none | period {start,end} | dates; YYYY-MM-DD or today±N (Japan time)
      "offeringAfterPublish": { "kind": "period", "start": "today-30", "end": "today-1" },   // saved by an edit after publishing
      "state": "published",   // draft | published | unpublished (by the manager) | ended (offering ended by hand)
      "suspended": false,     // by the operator, after the state
      "by": "owner-x@example.com"   // optional
    }],
    "suspended": false   // by the operator, last
  }],
  "regions": [{
    "key": "R1", "name": "みなと商店街",
    "address": { "postalCode": "231-0023", "rest": "201-1" },   // optional, as the location
    "location": { "latitude": 35.4437, "longitude": 139.648 },
    "photos": ["region-seed.jpg"],
    "description": "昔ながらの店が並ぶ商店街です。", "tagline": "駅から続く商店街",
    "publication": "published",   // draft | published | unpublished (published, then unpublished by the manager, last)
    "suspended": false,           // by the operator, last
    "members": [{ "appoint": "region-op1@example.com" }]   // appoint = grantStewardship; invite / resign as for places
  }],
  "listings": [   // listings of any place, created after every place, in this order (e.g. one first-publish order across places)
    { "place": "S2", "key": "L3", "name": "バラの花束", "category": "買う", "photos": ["bara.jpg"], "state": "published" }
  ],
  "affiliations": [   // established in the order listed (region.affiliation_established)
    { "place": "S1", "regions": ["R1"], "representative": "R1" }   // representative: chosen by the place's first steward
  ],
  "occasions": [{
    "key": "E1", "name": "みなと夏まつり",
    "period": { "start": "today+10", "end": "today+12" },   // YYYY-MM-DD or today±N
    "address": { "postalCode": "231-0023", "rest": "301-1" },   // the venue
    "location": { "latitude": 35.4441, "longitude": 139.649 },
    "photos": ["event-photo-1.jpg"], "description": null, "tagline": null,
    "publication": "published",   // draft | published | unpublished (last)
    "cancelled": false, "suspended": false,   // last
    "members": [{ "appoint": "event-op@example.com" }],
    "regionLinks": [{ "region": "R1" }, { "region": "R2", "detached": true }],   // linked by the manager; detached by the region's manager, last
    "participations": [{ "place": "S1", "listings": ["L1"], "dates": ["today+10"] }]   // steward: as an approval; none: addParticipationDirectly
  }]
}
```

A fixture with `onto` in place of `operators` / `editors` / `categories` seeds into a state an earlier seed filled (what `--add`, `--remove` and `--volume` send): it opens nothing, reuses existing accounts, uses the active categories, deletes `onto.deleteListings` first (each `{ "id", "by" }`, `by` defaulting to the operator), and lets `onto.places` / `onto.regions` (`{ key: id }`) stand wherever a place or region key is. `onto.operator` acts where the first operator would.

Categories: initial categories the list does not name are renamed to the missing names in order, further names are added, and initial ones still unnamed are retired (successor: the first listed). Place, listing, region and occasion keys must each be unique; the answer maps them (and account addresses, category names) to ids. A region linked to an occasion must be published when the link is made (its suspension comes last); a participation's listings must be the place's published listings (unpublishing and suspending them comes last) and its dates within the period.

### Development paths for affiliations and participations

Stage 3a has no affiliation or participation applications (S3B), so nothing in the product can create an affiliation, or a participation of a place with a steward. The seed does it through two development tools in `packages/core/src/application/dev/`, which, like `/__dev/stewards`, do what the approval will and are refused while `DEV_TOOLS` is off. They have no route of their own; only `/__dev/seed` uses them.

- `devEstablishAffiliation`: `PlaceAffiliations.affiliate` through `readAffiliations` / `persistAffiliations`, emitting `region.affiliation_established`. The application's premises are not checked.
- `devEstablishParticipation`: `Participation.establish` for a place with a steward, emitting `occasion.participation_established`. The dates and listings are checked as a submission checks them; the holding status is not, so an occasion that has since ended can have a participation.

### What the fixtures leave out

Applications of any kind are not seeded, and articles (S5) do not exist yet. Each fixture leaves these to be done by hand (or waits for a later stage):

| Document | Left out |
| --- | --- |
| shop | Step 5 (URLs noted before S7 is suspended): S7 is seeded suspended, so build the URLs from the ids instead (`/places/<S7>`, `/manage/places/<id>/…`). Steward X of S1/S2 and Z of S13 are appointed as a claim approval would, not through RQ-03 + CM-01 |
| listing | P1's affiliation with 「谷中ぎんざ会」 is established through the development path, not through X's RQ-05 and its approval. L11 is created and published by the operator standing in for the absent steward, not through user B's RQ-04 and its approval. Stewards X of P1–P3 are appointed without the RQ-03 relation and contact. Steps 6–7 (noted URLs, browser 3's saved item) |
| application | Nothing of the test data. The document gives no addresses or photos: places, regions and the events' venues are in 谷中・根津・千駄木 by name, listings, regions and events get a photo named after them (`blend.jpg`, `kurumi.jpg`, `anpan.jpg`, `gururi-1.jpg`, `sanpo-1.jpg`, `koshomatsuri-1.jpg`, `akarimatsuri-1.jpg`) |
| moderation | Article 「谷中で過ごす休日」 (`kyujitsu-1.jpg`, S5): editor1 exists with no article. The affiliations and 喫茶ひだまり's participation (no listings or dates: the document gives none) are established through the development paths |
| operation | Articles 「谷中で過ごす休日」「根津の古書店めぐり」 (S5). `operator9@` is not created (its test case does it). Regions and the event get a photo named after them |
| membership | User A's revision application for 谷中ベーカリー (step 5) and L's affiliation application to 「谷中ぐるり」 (step 6; the affiliation kind comes with S3B). 「くるみパン」 is given the category 食べる and `kurumi.jpg` |
| account | Nothing of the test data. 日暮里せんべい is placed in 谷中 7-1-1 (the development area sample has no 日暮里) |
| region | Nothing of the base data (the document's test cases prepare their applications themselves). 喫茶みなと's participation in みなと夏まつり and every affiliation, 古書かもめ's made while it has no steward included, are established through the development paths. The events have no tagline or description (the document gives none); events get `event-photo-1.jpg`, listings a photo named after them |
| discover | Articles A1–A3 (S5). The affiliations (S8's representative R2 is chosen by 店舗管理者B) and S1's and S2's participations go through the development paths. The document gives no photos for regions and events, which cannot be published without one: each gets `region-<key>.jpg` / `event-<key>.jpg` (R1 its two). Listings are published in the table's order across places (fixture-level `listings`). Descriptions hold only the words the document names (L1 「深煎り」, R4 「縁側」, E5 「提灯」, S1, R1, E1). Sets X, Z, W: `--add` / `--remove` |
| explore | As discover, plus S9, S10 and Y1–Y4 (registered after S8; Y1–Y4 affiliated with R1 after the base affiliations). `viewer@example.com` is not created (the first login does it). Set X: `--add` / `--remove` |
| keep | As discover, plus P1 (published last, by 店舗管理者K). The `keep-*` accounts are not created: the document needs them to start without an account. Nothing is saved: every save is a step of the document (bookmarks need no seeding). Set bulk (TC-KEP-046): `--add` / `--remove` |
| event | Nothing of the base data. 喫茶みなと's participations (みなと夏まつり, 春の古本市, 冬のマルシェ), 海辺ベーカリー's (秋のあかり展) and 港の本屋's affiliation with 港町通り go through the development paths; 古書かもめ's is added directly by the event operator. 春の古本市 is recorded as ended by the seed's final `recordEndedOccasions` run (`occasion.ended`). 旧市街 and 運河地区 have no region operator (the document names none); regions get `region-seed.jpg` |

Where a document gives no address the fixture picks one in 谷中 (`110-0001`), 千駄木 (`113-0022`) or 根津 (`113-0031`) — for region and event, 山下町 (`231-0023`) — and a location near it.

## Several environments side by side

Each server can keep its own state, so procedures that need an untouched environment can run in parallel: `cd apps/web && LUNT_STATE_DIR=.wrangler/state-b pnpm exec vite dev --port 3102 --strictPort` (any directory under `apps/web/.wrangler/`). `LUNT_STATE_DIR=.wrangler/state-b pnpm dev:reset` empties that one. The development tools answer on every port of `localhost`.

## What the procedures' wording maps to

| Procedure says | Do |
| --- | --- |
| テスト環境で受け取ったメール | `/__dev/inbox` (filter by recipient; links in the mail open directly) |
| 提供元・外部アカウント | 「Google でログイン」 goes to `/__dev/idp/authorize`: give a verified address, an unverified one, no address, or cancel |
| テスト環境の時刻を N 分／日 進める | `/__dev/clock` → 「時刻を進める」. Time only moves forward; it applies from the next page load, operation or job |
| 時刻を初期状態に戻す | `/__dev/clock` → 「実際の時刻に戻す」 (offset 0; `pnpm dev:reset` also resets it with the data) |
| テスト環境で日次のジョブを実行する | `/__dev/clock` → 「日次のジョブを実行する」 (every daily job, on the application's time; the result per job is listed) |
| 日次のジョブは手順が実行を指示したときだけ動く | `DAILY_JOBS_AUTO="off"` (in the example settings) stops the Cron Trigger |
| 通信エラー | the browser's developer tools → offline |
| 店舗管理者 O1 の店舗（段階2） | Stage 2 has no screen that gives a store its first steward (claim approval comes with S2B). Log the account in once, then `/__dev/stewards` → store id (from `/places/$placeId`) + the account's address. It records the appointment as a claim approval would (`authority.steward_appointed`, `via: "application"`); later stewards join through CM-02 invitations |
| 所属の申請と承認・参加の申請と承認で作る（段階3a のテストデータ） | Stage 3a has no affiliation or participation applications (S3B). `/__dev/seed` establishes them as the approval will (「Development paths for affiliations and participations」 above) |

## Where the development tools answer

With `DEV_TOOLS=1` the development tools — `/__dev/*` (clock and manual daily jobs, inbox, fake provider), the development clock's offset, the development inbox and fake Google as adapters, and the public development secrets — answer only requests to this machine: `localhost`, `127.0.0.1`, `[::1]` (`.spec-implement/design.md` D-19). A request to any other host gets them off: `/__dev/*` is not found, time is the wall clock, and a configuration that selects the development inbox or the fake provider (or keeps the public development secrets) refuses to serve it.

A shared test environment that testers reach by another host name sets `DEV_TOOLS_ALLOW_REMOTE="1"` in addition. Do this only for an environment used by trusted people: the fake provider lets anyone log in as any address, and `/__dev/clock` lets anyone move time and run the daily jobs. Never set either variable in a production configuration.

## How the development clock works

The state object keeps an offset (ms): it is only ever increased, or put back to 0 (the wall clock). While `DEV_TOOLS=1`, every request, queue batch and scheduled run gets a clock of wall time + offset (`packages/core/src/application/di/clock.ts`), so login expiry, publication dates, offering ends, review periods and job cut-offs all see the advanced time. Infrastructure timers inside the state object (outbox relay back-off, retention) keep wall time. With `DEV_TOOLS` off the offset is never read, `/__dev/*` does not exist, the state object refuses to advance the clock, and `DAILY_JOBS_AUTO` is ignored.

Time never goes back to an arbitrary point: the only way back is to the wall clock (「実際の時刻に戻す」), which with `pnpm dev:reset` restores the initial state `spec/manual-tests/editorial.md` asks for.
