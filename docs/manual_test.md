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
node apps/web/scripts/seedManualTest.mjs shop --port 3102            # shop | listing | application | moderation | operation | membership | account
```

The script posts `apps/web/scripts/manual-test-fixtures/<document>.json` to `POST /__dev/seed` (a development tool: not found while `DEV_TOOLS` is off or the host is not local). It prints the ids it created, the `/places/<id>` and `/listings/<id>` URLs, and saves them to `apps/web/.wrangler/seed-<document>-<port>.json`. It replaces the opening procedure (step 3 above): the first operator and the initial categories are part of the seed. Run it once per empty state; it is not idempotent.

`devSeed` (`packages/core/src/application/dev/devSeed.ts`) goes through the product's usecases as the account the procedure names, so events, notifications and invariants are real: accounts as a development login; the first operator by `establishFirstOperator`, other operators and editors by `grantRole`; categories by `provisionInitialCategories` / `renameCategory` / `addCategory` / `retireCategory`; places by `registerPlaceByProxy` as the first operator; stewards as `/__dev/stewards` does (claim approval) or through `inviteMember` / `acceptInvitation` / `resignStewardship`; listings by `createListingDraft` / `publishListing` and the transition usecases as their manager (the first current steward, or the operator standing in for an absent one). Photos are PNGs drawn with their label (`seedPhotoPng`), registered with consent by the account that uses them and stored like any upload; every mention of a label registers a new photo from the same bytes.

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
  }]
}
```

Categories: initial categories the list does not name are renamed to the missing names in order, further names are added, and initial ones still unnamed are retired (successor: the first listed). Place and listing keys must be unique; the answer maps them (and account addresses, category names) to ids.

### What the fixtures leave out

Stage 2 has no regions, occasions or articles, and the application kinds are not seeded. Each fixture leaves these to be done by hand (or waits for a later stage):

| Document | Left out |
| --- | --- |
| shop | Step 5 (URLs noted before S7 is suspended): S7 is seeded suspended, so build the URLs from the ids instead (`/places/<S7>`, `/manage/places/<id>/…`). Steward X of S1/S2 and Z of S13 are appointed as a claim approval would, not through RQ-03 + CM-01 |
| listing | Region 「谷中ぎんざ会」 (`ginza-1.jpg`) and P1's affiliation. L11 is created and published by the operator standing in for the absent steward, not through user B's RQ-04 and its approval. Stewards X of P1–P3 are appointed without the RQ-03 relation and contact. Steps 6–7 (noted URLs, browser 3's saved item) |
| application | Regions 「谷中ぐるり」 (RA) and 「根津さんぽ」, events 「秋の古書まつり」「根津の灯りまつり」 (EA): the accounts exist without those stewardships. The document gives no addresses or photos: places are in 谷中・根津・千駄木 by name, listings get a photo named after them (`blend.jpg`, `kurumi.jpg`, `anpan.jpg`) |
| moderation | Regions 「谷中ぶらり」「根津めぐり」「千駄木さんぽ」 and their affiliations, event 「谷中あかりまつり」 and its participation, article 「谷中で過ごす休日」 (photos `yanaka-*`, `nezu-1`, `sendagi-1`, `akari-1`, `kyujitsu-1`): regionop, eventop and editor1 exist with no target |
| operation | Regions 「谷中ぶらり」 (regionop) and 「根津かいわい」, event 「谷中ほおずき市」, articles 「谷中で過ごす休日」「根津の古書店めぐり」. `operator9@` is not created (its test case does it) |
| membership | Region 「谷中ぐるり」 (RA), event 「谷中あかり祭り」 (EO); user A's revision application for 谷中ベーカリー (step 5) and L's affiliation application (step 6). 「くるみパン」 is given the category 食べる and `kurumi.jpg` |
| account | Region 「谷中ぐるり」 and event 「谷中あかり祭り」 of user M. 日暮里せんべい is placed in 谷中 7-1-1 (the development area sample has no 日暮里) |

Where a document gives no address the fixture picks one in 谷中 (`110-0001`), 千駄木 (`113-0022`) or 根津 (`113-0031`), and a location near it.

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

## Where the development tools answer

With `DEV_TOOLS=1` the development tools — `/__dev/*` (clock and manual daily jobs, inbox, fake provider), the development clock's offset, the development inbox and fake Google as adapters, and the public development secrets — answer only requests to this machine: `localhost`, `127.0.0.1`, `[::1]` (`.spec-implement/design.md` D-19). A request to any other host gets them off: `/__dev/*` is not found, time is the wall clock, and a configuration that selects the development inbox or the fake provider (or keeps the public development secrets) refuses to serve it.

A shared test environment that testers reach by another host name sets `DEV_TOOLS_ALLOW_REMOTE="1"` in addition. Do this only for an environment used by trusted people: the fake provider lets anyone log in as any address, and `/__dev/clock` lets anyone move time and run the daily jobs. Never set either variable in a production configuration.

## How the development clock works

The state object keeps an offset (ms): it is only ever increased, or put back to 0 (the wall clock). While `DEV_TOOLS=1`, every request, queue batch and scheduled run gets a clock of wall time + offset (`packages/core/src/application/di/clock.ts`), so login expiry, publication dates, offering ends, review periods and job cut-offs all see the advanced time. Infrastructure timers inside the state object (outbox relay back-off, retention) keep wall time. With `DEV_TOOLS` off the offset is never read, `/__dev/*` does not exist, the state object refuses to advance the clock, and `DAILY_JOBS_AUTO` is ignored.

Time never goes back to an arbitrary point: the only way back is to the wall clock (「実際の時刻に戻す」), which with `pnpm dev:reset` restores the initial state `spec/manual-tests/editorial.md` asks for.
