import { ConflictError, NotFoundError } from "@repo/core/application/errors";
import {
  type ApplicationIds,
  applicationIds,
  approved,
  holds,
  ofKind,
  rejected,
  reply,
  returned,
  standInDesired,
  standInPatch,
  submitted,
  type TestApplication,
  targets,
  withdrawn,
} from "@repo/core/domain/application/__tests__/fixtures";
import {
  type TestKindMap,
  TestModel,
} from "@repo/core/domain/application/__tests__/testKinds";
import type { SlotIn } from "@repo/core/domain/application/kind";
import type { ApplicationRepository } from "@repo/core/domain/application/ports/applicationRepository";
import type { Pagination } from "@repo/core/domain/common/pagination";
import { describe, expect, it } from "vitest";
import {
  ALL,
  type ApplicationHarness,
  type ApplicationHarnessFactory,
  entities,
  findApplication,
  getApplication,
  idsOf,
  inIdOrder,
  insertApplications,
  saveApplication,
  scrambledIds,
  sortedIds,
  steps,
  storeThrough,
} from "./applicationFixtures";
import { expectBusinessRuleError } from "./assertions";
import { barrier, ScopeAbort } from "./fixtures";

const { Application, ApplicationSlot } = TestModel;

type Target = Parameters<typeof ApplicationSlot.of>[0];

function slotOf(target: Target): SlotIn<TestKindMap> {
  const slot = ApplicationSlot.of(target);
  if (slot === null) throw new Error("expected a slot");
  return slot;
}

const page = (n: number, limit: number): Pagination => ({ page: n, limit });

function query<T>(
  h: ApplicationHarness,
  fn: (repository: ApplicationRepository<TestKindMap>) => Promise<T>,
): Promise<T> {
  return h.run(({ applicationRepository }) => fn(applicationRepository));
}

async function expectConflict(promise: Promise<unknown>): Promise<void> {
  await expect(promise).rejects.toBeInstanceOf(ConflictError);
}

/** Two scopes read `id` at the same version, then save their own next state. */
async function raceSaves(
  h: ApplicationHarness,
  id: TestApplication["id"],
  first: (app: TestApplication) => TestApplication,
  second: (app: TestApplication) => TestApplication,
): Promise<readonly PromiseSettledResult<TestApplication>[]> {
  const bothRead = barrier(2);
  const attempt = (next: (app: TestApplication) => TestApplication) =>
    h.run(async ({ applicationRepository }) => {
      const read = await applicationRepository.findById(id);
      if (read === null) throw new Error("missing");
      await bothRead();
      const saved = next(read.entity);
      await applicationRepository.save(saved, read.expectedVersion);
      return saved;
    });
  return Promise.allSettled([attempt(first), attempt(second)]);
}

async function expectOneWinner(
  h: ApplicationHarness,
  results: readonly PromiseSettledResult<TestApplication>[],
): Promise<void> {
  const won = results.filter(
    (r): r is PromiseFulfilledResult<TestApplication> =>
      r.status === "fulfilled",
  );
  const lost = results.filter(
    (r): r is PromiseRejectedResult => r.status === "rejected",
  );
  expect(won).toHaveLength(1);
  expect(lost).toHaveLength(1);
  expect(lost[0]?.reason).toBeInstanceOf(ConflictError);
  const winner = won[0]?.value;
  if (winner === undefined) throw new Error("no winner");
  expect((await getApplication(h, winner.id)).entity).toEqual(winner);
}

/** Five applications about place P from different applicants, all active. */
function fiveActiveAbout(ids: ApplicationIds, p = ids.place()) {
  return scrambledIds(ids, 5).map((id) =>
    submitted(ids, targets.revision(ids.account(), p), ids.tick(), {}, id),
  );
}

/** `spec/testcases/ports/applicationRepository.md`. */
export function describeApplicationRepositoryContract(
  makeHarness: ApplicationHarnessFactory,
): void {
  describe("ApplicationRepository contract", () => {
    describe("insert・findById・save", () => {
      it("applicationRepository#1 申請が保存されていない / findById を呼ぶ", async () => {
        const h = await makeHarness();
        expect(
          await findApplication(h, applicationIds().application()),
        ).toBeNull();
      });

      it("applicationRepository#2 申請が保存されていない / A の情報修正の申請（P）を insert し、findById で読む", async () => {
        const h = await makeHarness();
        const ids = applicationIds();
        const at = ids.tick();
        const app = submitted(
          ids,
          targets.revision(ids.account(), ids.place()),
          at,
          {
            photos: [ids.photo()],
          },
        );
        await insertApplications(h, app);
        const found = await getApplication(h, app.id);
        expect(found.entity).toEqual(app);
        expect(found.entity.status).toEqual({
          kind: "underReview",
          since: at,
          answering: null,
        });
        expect(found.entity.submittedAt).toEqual(at);
        expect(found.expectedVersion).toBe(app.version);
      });

      it("applicationRepository#3 申請が保存されていない / 8種の申請と併せた管理権限の申請（登録、情報修正、管理権限、併せた管理権限、所属、離脱、参加、掲載、掲載の修正）をそれぞれ insert し、findById で読む", async () => {
        const h = await makeHarness();
        const ids = applicationIds();
        const a = ids.account();
        const p = ids.place();
        const registration = submitted(
          ids,
          targets.registration(a),
          ids.tick(),
          {
            photos: [ids.photo(), ids.photo()],
          },
        );
        const apps: readonly TestApplication[] = [
          registration,
          submitted(ids, targets.revision(a, p), ids.tick(), {
            photos: [ids.photo()],
            name: "修正後の名前",
          }),
          submitted(ids, targets.stewardship(a, p)),
          submitted(
            ids,
            targets.stewardship(
              a,
              registration.reservedPlaceId,
              registration.id,
            ),
          ),
          submitted(ids, targets.affiliation(p, ids.region())),
          submitted(ids, targets.leave(p, ids.region(), a)),
          submitted(ids, targets.participation(p, ids.occasion()), ids.tick(), {
            listingIds: [ids.listing(), ids.listing()],
            dates: ["2026-10-01", "2026-10-03"],
          }),
          submitted(ids, targets.listing(a, p), ids.tick(), {
            photos: [ids.photo()],
          }),
          submitted(
            ids,
            targets.listingRevision(a, ids.listing()),
            ids.tick(),
            {
              photos: [ids.photo()],
              placeId: p,
            },
          ),
        ];
        await insertApplications(h, ...apps);
        for (const app of apps) {
          expect((await getApplication(h, app.id)).entity).toEqual(app);
        }
      });

      it("applicationRepository#4 申請が保存されていない。内容が指す店舗・地域・イベント・掲載・登録申請は、どのポートにも保存されていない / その申請を insert する", async () => {
        const h = await makeHarness();
        const ids = applicationIds();
        const a = ids.account();
        const apps = [
          submitted(
            ids,
            targets.stewardship(a, ids.place(), ids.application()),
          ),
          submitted(ids, targets.participation(ids.place(), ids.occasion())),
          submitted(ids, targets.listingRevision(a, ids.listing())),
        ];
        await insertApplications(h, ...apps);
        expect(
          sortedIds(await query(h, (r) => r.findByIds(idsOf(apps)))),
        ).toEqual(sortedIds(apps));
      });

      it("applicationRepository#5 同じ ApplicationId の申請が保存されている / 同じ ID の申請を insert する", async () => {
        const h = await makeHarness();
        const ids = applicationIds();
        const first = submitted(
          ids,
          targets.listing(ids.account(), ids.place()),
        );
        await insertApplications(h, first);
        const other = submitted(
          ids,
          targets.revision(ids.account(), ids.place()),
          ids.tick(),
          {},
          first.id,
        );
        await expectConflict(insertApplications(h, other));
        expect((await getApplication(h, first.id)).entity).toEqual(first);
      });

      it("applicationRepository#6 確認中の申請が保存されている / findById の expectedVersion で、差し戻しにした申請を save し、findById で読む", async () => {
        const h = await makeHarness();
        const ids = applicationIds();
        const app = submitted(
          ids,
          targets.revision(ids.account(), ids.place()),
        );
        await insertApplications(h, app);
        const read = await getApplication(h, app.id);
        const back = returned(
          Application.requireUnderReview(read.entity),
          ids.tick(),
        );
        await saveApplication(h, back, read.expectedVersion);
        const found = await getApplication(h, app.id);
        expect(found.entity).toEqual(back);
        expect(found.entity.status).toMatchObject({ kind: "returned" });
        expect(found.entity.version).toBe(app.version + 1);
        expect(found.expectedVersion).toBe(app.version + 1);
      });

      it("applicationRepository#7 差し戻しの申請が保存されている / 内容を置き換え、回答を添えて再提出した申請を save し、findById で読む", async () => {
        const h = await makeHarness();
        const ids = applicationIds();
        const app = submitted(
          ids,
          targets.revision(ids.account(), ids.place()),
        );
        const back = await storeThrough(h, app, steps.returned(ids.tick()));
        const read = await getApplication(h, back.id);
        const at = ids.tick();
        const answer = reply("営業時間の写真を添えました");
        const again = Application.resubmit(
          Application.requireReturned(ofKind(read.entity, "revision")),
          {
            content: standInPatch([ids.photo()], ["name", "status"]),
            reply: answer,
            desired: standInDesired("新しい名前"),
          },
          holds(app.target),
          at,
        ).entity;
        await saveApplication(h, again, read.expectedVersion);
        const found = (await getApplication(h, app.id)).entity;
        expect(found).toEqual(again);
        expect(ofKind(found, "revision").content.fields).toEqual([
          "name",
          "status",
        ]);
        expect(found.status).toMatchObject({
          kind: "underReview",
          since: at,
          answering: { reply: answer },
        });
        expect(found.submittedAt).toEqual(app.submittedAt);
      });

      it("applicationRepository#8 確認中の所属の申請と情報修正の申請が保存されている / それぞれを、承認、否認、取り下げ、失効にして save し、findById で読む", async () => {
        const h = await makeHarness();
        const ids = applicationIds();
        const p = ids.place();
        const outcomes = [
          [
            steps.approved(ids.tick(), "overdue_proxy"),
            steps.approved(ids.tick()),
          ],
          [steps.rejected(ids.tick()), steps.rejected(ids.tick())],
          [steps.withdrawn(ids.tick()), steps.withdrawn(ids.tick())],
          [steps.lapsed(ids.tick()), steps.lapsed(ids.tick())],
        ] as const;
        for (const [affiliationStep, revisionStep] of outcomes) {
          for (const [app, step] of [
            [
              submitted(ids, targets.affiliation(p, ids.region())),
              affiliationStep,
            ],
            [
              submitted(ids, targets.revision(ids.account(), p), ids.tick(), {
                photos: [ids.photo()],
              }),
              revisionStep,
            ],
          ] as const) {
            const stored = await storeThrough(h, app, step);
            const found = (await getApplication(h, app.id)).entity;
            expect(found).toEqual(stored);
            expect(found.content).toEqual(app.content);
          }
        }
        const statuses = await query(h, (r) =>
          r.findPageBySubject({ kind: "place", id: p }, {}, ALL),
        );
        expect(
          statuses.items.map((app) => [app.target.kind, app.status]),
        ).toEqual(
          expect.arrayContaining([
            ["affiliation", { kind: "approved", reviewAs: "overdue_proxy" }],
            [
              "affiliation",
              expect.objectContaining({
                kind: "rejected",
                reviewAs: "approver",
              }),
            ],
            ["revision", { kind: "approved" }],
            ["revision", { kind: "rejected", reason: expect.any(String) }],
            [
              "revision",
              { kind: "lapsed", brokenPremises: ["placeHasNoSteward"] },
            ],
          ]),
        );
      });

      it("applicationRepository#9 確認中の申請が保存されている。findById の後に、別の save がコミットされた / 古い expectedVersion で save する", async () => {
        const h = await makeHarness();
        const ids = applicationIds();
        const app = submitted(
          ids,
          targets.revision(ids.account(), ids.place()),
        );
        await insertApplications(h, app);
        const stale = await getApplication(h, app.id);
        const gone = withdrawn(
          Application.requireActive(stale.entity),
          ids.tick(),
        );
        await saveApplication(h, gone, stale.expectedVersion);
        await expectConflict(
          saveApplication(
            h,
            approved(Application.requireUnderReview(stale.entity), ids.tick()),
            stale.expectedVersion,
          ),
        );
        expect((await getApplication(h, app.id)).entity).toEqual(gone);
      });

      it("applicationRepository#10 申請が保存されていない / その ID の申請を save する", async () => {
        const h = await makeHarness();
        const ids = applicationIds();
        const stored = submitted(
          ids,
          targets.listing(ids.account(), ids.place()),
        );
        await insertApplications(h, stored);
        const { expectedVersion } = await getApplication(h, stored.id);
        const missing = submitted(
          ids,
          targets.revision(ids.account(), ids.place()),
        );
        await expect(
          saveApplication(h, withdrawn(missing, ids.tick()), expectedVersion),
        ).rejects.toBeInstanceOf(NotFoundError);
      });

      it("applicationRepository#11 — / ポートの型を確かめる", async () => {
        type HasDelete = "delete" extends keyof ApplicationRepository
          ? true
          : false;
        const hasDelete: HasDelete = false;
        expect(hasDelete).toBe(false);
        const h = await makeHarness();
        expect(
          await h.run(async (ctx) => "delete" in ctx.applicationRepository),
        ).toBe(false);
      });
    });

    describe("枠の一意性", () => {
      it("applicationRepository#12 A の情報修正の申請（P）が確認中で保存されている / A の情報修正の申請（P）を、別の ID で insert する", async () => {
        const h = await makeHarness();
        const ids = applicationIds();
        const target = targets.revision(ids.account(), ids.place());
        const first = submitted(ids, target);
        await insertApplications(h, first);
        const second = submitted(ids, target);
        await expectConflict(insertApplications(h, second));
        expect((await getApplication(h, first.id)).entity).toEqual(first);
        expect(await findApplication(h, second.id)).toBeNull();
      });

      it("applicationRepository#13 A の情報修正の申請（P）が差し戻しで保存されている / A の情報修正の申請（P）を、別の ID で insert する", async () => {
        const h = await makeHarness();
        const ids = applicationIds();
        const target = targets.revision(ids.account(), ids.place());
        await storeThrough(
          h,
          submitted(ids, target),
          steps.returned(ids.tick()),
        );
        await expectConflict(insertApplications(h, submitted(ids, target)));
      });

      it("applicationRepository#14 A の情報修正の申請（P）が確認中で保存されている / B の情報修正の申請（P）を insert する", async () => {
        const h = await makeHarness();
        const ids = applicationIds();
        const p = ids.place();
        await insertApplications(
          h,
          submitted(ids, targets.revision(ids.account(), p)),
        );
        const b = submitted(ids, targets.revision(ids.account(), p));
        await insertApplications(h, b);
        expect((await getApplication(h, b.id)).entity).toEqual(b);
      });

      it("applicationRepository#15 A の情報修正の申請（P）が確認中で保存されている / A の情報修正の申請（Q）と、A の管理権限の申請（P）を insert する", async () => {
        const h = await makeHarness();
        const ids = applicationIds();
        const a = ids.account();
        const p = ids.place();
        await insertApplications(h, submitted(ids, targets.revision(a, p)));
        const others = [
          submitted(ids, targets.revision(a, ids.place())),
          submitted(ids, targets.stewardship(a, p)),
        ];
        await insertApplications(h, ...others);
        expect(
          sortedIds(await query(h, (r) => r.findByIds(idsOf(others)))),
        ).toEqual(sortedIds(others));
      });

      it("applicationRepository#16 所属の申請（P→X、店舗管理者として）が確認中で保存されている / 所属の申請（P→X、店舗管理者として）を、別の ID で insert する", async () => {
        const h = await makeHarness();
        const ids = applicationIds();
        const target = targets.affiliation(ids.place(), ids.region());
        await insertApplications(h, submitted(ids, target));
        await expectConflict(insertApplications(h, submitted(ids, target)));
      });

      it("applicationRepository#17 所属の申請（P→X、店舗管理者として）が確認中で保存されている / 所属の申請（P→Y、店舗管理者として）、離脱の申請（P→X、店舗管理者として）、A が個人として行う所属の申請（P→X）を insert する", async () => {
        const h = await makeHarness();
        const ids = applicationIds();
        const p = ids.place();
        const x = ids.region();
        await insertApplications(h, submitted(ids, targets.affiliation(p, x)));
        const others = [
          submitted(ids, targets.affiliation(p, ids.region())),
          submitted(ids, targets.leave(p, x)),
          submitted(ids, targets.affiliation(p, x, ids.account())),
        ];
        for (const app of others) await insertApplications(h, app);
        expect(
          sortedIds(await query(h, (r) => r.findByIds(idsOf(others)))),
        ).toEqual(sortedIds(others));
      });

      it("applicationRepository#18 A の登録申請 r に併せた管理権限の申請（placeId は P）が確認中で保存されている / 登録申請を参照しない、A の管理権限の申請（P）を insert する", async () => {
        const h = await makeHarness();
        const ids = applicationIds();
        const a = ids.account();
        const r = submitted(ids, targets.registration(a));
        const s = submitted(
          ids,
          targets.stewardship(a, r.reservedPlaceId, r.id),
        );
        await insertApplications(h, r, s);
        await expectConflict(
          insertApplications(
            h,
            submitted(ids, targets.stewardship(a, r.reservedPlaceId)),
          ),
        );
      });

      it("applicationRepository#19 A の登録申請が確認中で保存されている / A の登録申請を、別の ID と別の予約した reservedPlaceId で insert する", async () => {
        const h = await makeHarness();
        const ids = applicationIds();
        const a = ids.account();
        await insertApplications(h, submitted(ids, targets.registration(a)));
        const again = submitted(ids, targets.registration(a));
        await insertApplications(h, again);
        expect((await getApplication(h, again.id)).entity).toEqual(again);
      });

      it("applicationRepository#20 A の掲載の申請（P）が確認中で保存されている / A の掲載の申請（P）を、別の ID で insert する", async () => {
        const h = await makeHarness();
        const ids = applicationIds();
        const target = targets.listing(ids.account(), ids.place());
        await insertApplications(h, submitted(ids, target));
        const again = submitted(ids, target);
        await insertApplications(h, again);
        expect((await getApplication(h, again.id)).entity).toEqual(again);
      });

      it("applicationRepository#21 A の情報修正の申請（P）が、否認・取り下げ・失効・承認のどれかで保存されている / A の情報修正の申請（P）を、別の ID で insert する", async () => {
        for (const close of [
          steps.rejected,
          steps.withdrawn,
          (at: Date) => steps.lapsed(at),
          (at: Date) => steps.approved(at),
        ]) {
          const h = await makeHarness();
          const ids = applicationIds();
          const target = targets.revision(ids.account(), ids.place());
          const closed = await storeThrough(
            h,
            submitted(ids, target),
            close(ids.tick()),
          );
          const next = submitted(ids, target);
          await insertApplications(h, next);
          expect((await getApplication(h, next.id)).entity).toEqual(next);
          expect((await getApplication(h, closed.id)).entity).toEqual(closed);
        }
      });

      it("applicationRepository#22 A の情報修正の申請（P）が確認中で保存されている / その申請を取り下げにして save し、コミットの後に、A の情報修正の申請（P）を別の ID で insert する", async () => {
        const h = await makeHarness();
        const ids = applicationIds();
        const target = targets.revision(ids.account(), ids.place());
        await storeThrough(
          h,
          submitted(ids, target),
          steps.withdrawn(ids.tick()),
        );
        const next = submitted(ids, target);
        await insertApplications(h, next);
        expect(
          await query(h, (r) => r.findActiveBySlot(slotOf(target))),
        ).toEqual(next);
      });
    });

    describe("findByIds", () => {
      it("applicationRepository#23 確認中の申請 a1、承認の申請 a2、失効の申請 a3 が保存されている / a1・a2・a3 と、存在しない ID で findByIds を呼ぶ", async () => {
        const h = await makeHarness();
        const ids = applicationIds();
        const p = ids.place();
        const a1 = submitted(ids, targets.revision(ids.account(), p));
        await insertApplications(h, a1);
        const a2 = await storeThrough(
          h,
          submitted(ids, targets.revision(ids.account(), p)),
          steps.approved(ids.tick()),
        );
        const a3 = await storeThrough(
          h,
          submitted(ids, targets.revision(ids.account(), p)),
          steps.lapsed(ids.tick()),
        );
        const found = await query(h, (r) =>
          r.findByIds([a1.id, a2.id, a3.id, ids.application()]),
        );
        expect([...found].sort((x, y) => (x.id < y.id ? -1 : 1))).toEqual([
          a1,
          a2,
          a3,
        ]);
      });

      it("applicationRepository#24 申請が保存されている / 空の配列で findByIds を呼ぶ", async () => {
        const h = await makeHarness();
        const ids = applicationIds();
        await insertApplications(
          h,
          submitted(ids, targets.listing(ids.account(), ids.place())),
        );
        expect(await query(h, (r) => r.findByIds([]))).toEqual([]);
      });

      it("applicationRepository#25 100件の申請が保存されている / 100件の ID で findByIds を呼ぶ", async () => {
        const h = await makeHarness();
        const ids = applicationIds();
        const target = targets.listing(ids.account(), ids.place());
        const apps = Array.from({ length: 100 }, () => submitted(ids, target));
        await insertApplications(h, ...apps);
        const found = await query(h, (r) => r.findByIds(idsOf(apps)));
        expect(sortedIds(found)).toEqual(sortedIds(apps));
      });

      it("applicationRepository#26 — / 101件の ID で findByIds を呼ぶ", async () => {
        const h = await makeHarness();
        const ids = applicationIds();
        await expectBusinessRuleError(
          query(h, (r) =>
            r.findByIds(Array.from({ length: 101 }, () => ids.application())),
          ),
          "COMMON_INVALID_INPUT",
        );
      });
    });

    describe("findActiveBySlot", () => {
      it("applicationRepository#27 A の情報修正の申請（P）が確認中で保存されている / その枠で findActiveBySlot を呼ぶ", async () => {
        const h = await makeHarness();
        const ids = applicationIds();
        const target = targets.revision(ids.account(), ids.place());
        const app = submitted(ids, target);
        await insertApplications(h, app);
        expect(
          await query(h, (r) => r.findActiveBySlot(slotOf(target))),
        ).toEqual(app);
      });

      it("applicationRepository#28 A の情報修正の申請（P）が差し戻しで保存されている / その枠で呼ぶ", async () => {
        const h = await makeHarness();
        const ids = applicationIds();
        const target = targets.revision(ids.account(), ids.place());
        const back = await storeThrough(
          h,
          submitted(ids, target),
          steps.returned(ids.tick()),
        );
        expect(
          await query(h, (r) => r.findActiveBySlot(slotOf(target))),
        ).toEqual(back);
      });

      it("applicationRepository#29 A の情報修正の申請（P）が否認で保存されている。その枠の進行中の申請はない / その枠で呼ぶ", async () => {
        const h = await makeHarness();
        const ids = applicationIds();
        const target = targets.revision(ids.account(), ids.place());
        await storeThrough(
          h,
          submitted(ids, target),
          steps.rejected(ids.tick()),
        );
        expect(
          await query(h, (r) => r.findActiveBySlot(slotOf(target))),
        ).toBeNull();
      });

      it("applicationRepository#30 A の情報修正の申請（P）の否認の申請と、同じ枠の確認中の申請が保存されている / その枠で呼ぶ", async () => {
        const h = await makeHarness();
        const ids = applicationIds();
        const target = targets.revision(ids.account(), ids.place());
        await storeThrough(
          h,
          submitted(ids, target),
          steps.rejected(ids.tick()),
        );
        const active = submitted(ids, target);
        await insertApplications(h, active);
        expect(
          await query(h, (r) => r.findActiveBySlot(slotOf(target))),
        ).toEqual(active);
      });

      it("applicationRepository#31 B の情報修正の申請（P）だけが確認中で保存されている / A の情報修正（P）の枠で呼ぶ", async () => {
        const h = await makeHarness();
        const ids = applicationIds();
        const p = ids.place();
        await insertApplications(
          h,
          submitted(ids, targets.revision(ids.account(), p)),
        );
        expect(
          await query(h, (r) =>
            r.findActiveBySlot(slotOf(targets.revision(ids.account(), p))),
          ),
        ).toBeNull();
      });

      it("applicationRepository#32 所属の申請（P→X、店舗管理者として）が確認中で保存されている / 離脱（P→X、店舗管理者として）の枠、所属（P→Y、店舗管理者として）の枠でそれぞれ呼ぶ", async () => {
        const h = await makeHarness();
        const ids = applicationIds();
        const p = ids.place();
        const x = ids.region();
        await insertApplications(h, submitted(ids, targets.affiliation(p, x)));
        expect(
          await query(h, (r) =>
            r.findActiveBySlot(slotOf(targets.leave(p, x))),
          ),
        ).toBeNull();
        expect(
          await query(h, (r) =>
            r.findActiveBySlot(slotOf(targets.affiliation(p, ids.region()))),
          ),
        ).toBeNull();
      });
    });

    describe("findActiveBySubject", () => {
      it('applicationRepository#33 店舗 P に、A の情報修正の申請（確認中）、B の管理権限の申請（差し戻し）、参加の申請（P→E、確認中）、A の掲載の申請（承認）が保存されている。店舗 Q に、A の情報修正の申請（確認中）が保存されている / { kind: "place"; id: P }、page: 1、limit: 10 で呼ぶ', async () => {
        const h = await makeHarness();
        const ids = applicationIds();
        const [a, b] = [ids.account(), ids.account()];
        const [p, q] = [ids.place(), ids.place()];
        const [i1, i2, i3] = scrambledIds(ids, 3);
        const revision = submitted(
          ids,
          targets.revision(a, p),
          ids.tick(),
          {},
          i1,
        );
        await insertApplications(h, revision);
        const claimOfB = await storeThrough(
          h,
          submitted(ids, targets.stewardship(b, p), ids.tick(), {}, i2),
          steps.returned(ids.tick()),
        );
        const participation = submitted(
          ids,
          targets.participation(p, ids.occasion()),
          ids.tick(),
          {},
          i3,
        );
        await insertApplications(h, participation);
        await storeThrough(
          h,
          submitted(ids, targets.listing(a, p)),
          steps.approved(ids.tick()),
        );
        await insertApplications(h, submitted(ids, targets.revision(a, q)));
        const result = await query(h, (r) =>
          r.findActiveBySubject({ kind: "place", id: p }, page(1, 10)),
        );
        const expected = inIdOrder([revision, claimOfB, participation]);
        expect(idsOf(expected)).not.toEqual(
          idsOf([revision, claimOfB, participation]),
        );
        expect(entities(result.items)).toEqual(expected);
        expect(result.items.map((item) => item.expectedVersion)).toEqual(
          expected.map((app) => app.version),
        );
        expect(result.count).toBe(3);
      });

      it('applicationRepository#34 所属の申請（P→X）と離脱の申請（Q→X）が確認中、所属の申請（P→Y）が確認中で保存されている / { kind: "region"; id: X } で呼ぶ', async () => {
        const h = await makeHarness();
        const ids = applicationIds();
        const [p, q] = [ids.place(), ids.place()];
        const x = ids.region();
        const xs = [
          submitted(ids, targets.affiliation(p, x)),
          submitted(ids, targets.leave(q, x)),
        ];
        await insertApplications(
          h,
          ...xs,
          submitted(ids, targets.affiliation(p, ids.region())),
        );
        const result = await query(h, (r) =>
          r.findActiveBySubject({ kind: "region", id: x }, ALL),
        );
        expect(entities(result.items)).toEqual(xs);
        expect(result.count).toBe(2);
      });

      it('applicationRepository#35 参加の申請（P→E）が確認中、参加の申請（Q→E）が取り下げで保存されている / { kind: "occasion"; id: E } で呼ぶ', async () => {
        const h = await makeHarness();
        const ids = applicationIds();
        const e = ids.occasion();
        const active = submitted(ids, targets.participation(ids.place(), e));
        await insertApplications(h, active);
        await storeThrough(
          h,
          submitted(ids, targets.participation(ids.place(), e)),
          steps.withdrawn(ids.tick()),
        );
        const result = await query(h, (r) =>
          r.findActiveBySubject({ kind: "occasion", id: e }, ALL),
        );
        expect(entities(result.items)).toEqual([active]);
        expect(result.count).toBe(1);
      });

      it('applicationRepository#36 掲載 L の掲載の修正の申請が、A のものと B のもの、どちらも確認中で保存されている / { kind: "listing"; id: L } で呼ぶ', async () => {
        const h = await makeHarness();
        const ids = applicationIds();
        const l = ids.listing();
        const both = [
          submitted(ids, targets.listingRevision(ids.account(), l)),
          submitted(ids, targets.listingRevision(ids.account(), l)),
        ];
        await insertApplications(h, ...both);
        const result = await query(h, (r) =>
          r.findActiveBySubject({ kind: "listing", id: l }, ALL),
        );
        expect(entities(result.items)).toEqual(both);
        expect(result.count).toBe(2);
      });

      it('applicationRepository#37 A の登録申請 r と、r を参照する併せた管理権限の申請 s が、どちらも確認中で保存されている / { kind: "registration"; id: r } で呼ぶ', async () => {
        const h = await makeHarness();
        const ids = applicationIds();
        const a = ids.account();
        const r = submitted(ids, targets.registration(a));
        const s = submitted(
          ids,
          targets.stewardship(a, r.reservedPlaceId, r.id),
        );
        await insertApplications(h, r, s);
        const result = await query(h, (repo) =>
          repo.findActiveBySubject({ kind: "registration", id: r.id }, ALL),
        );
        expect(entities(result.items)).toEqual([s]);
      });

      it('applicationRepository#38 A の登録申請 r と、併せた管理権限の申請 s が確認中で保存されている / { kind: "place"; id: r の reservedPlaceId } で呼ぶ', async () => {
        const h = await makeHarness();
        const ids = applicationIds();
        const a = ids.account();
        const r = submitted(ids, targets.registration(a));
        const s = submitted(
          ids,
          targets.stewardship(a, r.reservedPlaceId, r.id),
        );
        await insertApplications(h, r, s);
        const result = await query(h, (repo) =>
          repo.findActiveBySubject(
            { kind: "place", id: r.reservedPlaceId },
            ALL,
          ),
        );
        expect(entities(result.items)).toEqual([r, s]);
      });

      it("applicationRepository#39 その対象に関わる進行中の申請がない / 呼ぶ", async () => {
        const h = await makeHarness();
        const ids = applicationIds();
        const p = ids.place();
        await storeThrough(
          h,
          submitted(ids, targets.revision(ids.account(), p)),
          steps.withdrawn(ids.tick()),
        );
        expect(
          await query(h, (r) =>
            r.findActiveBySubject({ kind: "place", id: p }, ALL),
          ),
        ).toEqual({ items: [], count: 0 });
      });

      it("applicationRepository#40 店舗 P に関わる進行中の申請が5件 / limit: 3 で、page: 1 と page: 2 を呼ぶ", async () => {
        const h = await makeHarness();
        const ids = applicationIds();
        const p = ids.place();
        const submittedInTurn = fiveActiveAbout(ids, p);
        await insertApplications(h, ...submittedInTurn);
        const five = inIdOrder(submittedInTurn);
        const [first, second] = await Promise.all(
          [1, 2].map((n) =>
            query(h, (r) =>
              r.findActiveBySubject({ kind: "place", id: p }, page(n, 3)),
            ),
          ),
        );
        expect(entities(first?.items ?? [])).toEqual(five.slice(0, 3));
        expect(entities(second?.items ?? [])).toEqual(five.slice(3));
        expect([first?.count, second?.count]).toEqual([5, 5]);
      });
    });

    describe("findActiveByIndividual", () => {
      it("applicationRepository#41 A の情報修正の申請（確認中）、A の管理権限の申請（差し戻し）、A の掲載の申請（否認）、B の情報修正の申請（確認中）、所属の申請（P→X、店舗管理者として。確認中）が保存されている / A、page: 1、limit: 10 で呼ぶ", async () => {
        const h = await makeHarness();
        const ids = applicationIds();
        const [a, b] = [ids.account(), ids.account()];
        const p = ids.place();
        const [smaller, larger] = scrambledIds(ids, 2).slice().reverse();
        if (smaller === undefined || larger === undefined) throw new Error();
        // Submitted first but with the larger id.
        const revision = submitted(
          ids,
          targets.revision(a, p),
          ids.tick(),
          {},
          larger,
        );
        await insertApplications(h, revision);
        const back = await storeThrough(
          h,
          submitted(ids, targets.stewardship(a, p), ids.tick(), {}, smaller),
          steps.returned(ids.tick()),
        );
        await storeThrough(
          h,
          submitted(ids, targets.listing(a, p)),
          steps.rejected(ids.tick()),
        );
        await insertApplications(
          h,
          submitted(ids, targets.revision(b, p)),
          submitted(ids, targets.affiliation(p, ids.region())),
        );
        const result = await query(h, (r) =>
          r.findActiveByIndividual(a, page(1, 10)),
        );
        expect(entities(result.items)).toEqual([back, revision]);
        expect(result.items.map((item) => item.expectedVersion)).toEqual([
          1, 0,
        ]);
        expect(result.count).toBe(2);
      });

      it("applicationRepository#42 A の進行中の申請がない / A で呼ぶ", async () => {
        const h = await makeHarness();
        const ids = applicationIds();
        const a = ids.account();
        await storeThrough(
          h,
          submitted(ids, targets.revision(a, ids.place())),
          steps.approved(ids.tick()),
        );
        expect(await query(h, (r) => r.findActiveByIndividual(a, ALL))).toEqual(
          { items: [], count: 0 },
        );
      });

      it("applicationRepository#43 A の進行中の申請が5件 / limit: 3 で、page: 1 と page: 2 を呼ぶ", async () => {
        const h = await makeHarness();
        const ids = applicationIds();
        const a = ids.account();
        const submittedInTurn = scrambledIds(ids, 5).map((id) =>
          submitted(ids, targets.revision(a, ids.place()), ids.tick(), {}, id),
        );
        await insertApplications(h, ...submittedInTurn);
        const five = inIdOrder(submittedInTurn);
        const first = await query(h, (r) =>
          r.findActiveByIndividual(a, page(1, 3)),
        );
        const second = await query(h, (r) =>
          r.findActiveByIndividual(a, page(2, 3)),
        );
        expect(entities(first.items)).toEqual(five.slice(0, 3));
        expect(entities(second.items)).toEqual(five.slice(3));
        expect([first.count, second.count]).toEqual([5, 5]);
      });
    });

    describe("findPageByApplicants", () => {
      async function applicantsSetup() {
        const h = await makeHarness();
        const ids = applicationIds();
        const [a, b] = [ids.account(), ids.account()];
        const [p, q] = [ids.place(), ids.place()];
        const a1 = submitted(ids, targets.revision(a, ids.place()), ids.tick());
        const p1 = submitted(
          ids,
          targets.affiliation(p, ids.region()),
          ids.tick(),
        );
        const a2 = rejected(
          submitted(ids, targets.listing(a, ids.place()), ids.tick()),
          ids.tick(),
        );
        const q1 = submitted(ids, targets.affiliation(q, ids.region()));
        const b1 = submitted(ids, targets.revision(b, ids.place()));
        await insertApplications(h, a1, p1, a2, q1, b1);
        return { h, a, p, a1, a2, p1 };
      }

      it("applicationRepository#44 A の個人の申請 a1（先に提出）、a2（後に提出、否認）、店舗 P について店舗管理者として行った申請 p1（a1 と a2 の間に提出）、店舗 Q について店舗管理者として行った申請 q1、B の個人の申請 b1 が保存されている / { individual: A; places: [P] } で呼ぶ", async () => {
        const { h, a, p, a1, a2, p1 } = await applicantsSetup();
        const result = await query(h, (r) =>
          r.findPageByApplicants({ individual: a, places: [p] }, ALL),
        );
        expect(result.items).toEqual([a2, p1, a1]);
        expect(result.count).toBe(3);
      });

      it("applicationRepository#45 同上 / { individual: null; places: [P] } で呼ぶ", async () => {
        const { h, p, p1 } = await applicantsSetup();
        const result = await query(h, (r) =>
          r.findPageByApplicants({ individual: null, places: [p] }, ALL),
        );
        expect(result).toEqual({ items: [p1], count: 1 });
      });

      it("applicationRepository#46 同上 / { individual: A; places: [] } で呼ぶ", async () => {
        const { h, a, a1, a2 } = await applicantsSetup();
        const result = await query(h, (r) =>
          r.findPageByApplicants({ individual: a, places: [] }, ALL),
        );
        expect(result).toEqual({ items: [a2, a1], count: 2 });
      });

      it("applicationRepository#47 A が個人として行った所属の申請（P→X）が保存されている。店舗 P について店舗管理者として行った申請はない / { individual: null; places: [P] } で呼ぶ", async () => {
        const h = await makeHarness();
        const ids = applicationIds();
        const p = ids.place();
        await insertApplications(
          h,
          submitted(ids, targets.affiliation(p, ids.region(), ids.account())),
        );
        expect(
          await query(h, (r) =>
            r.findPageByApplicants({ individual: null, places: [p] }, ALL),
          ),
        ).toEqual({ items: [], count: 0 });
      });

      it("applicationRepository#48 差し戻しの後に再提出された申請 a1（最初の提出が先）と、その再提出より前に提出された申請 a2（最初の提出は a1 より後）が保存されている / A で呼ぶ", async () => {
        const h = await makeHarness();
        const ids = applicationIds();
        const a = ids.account();
        const first = submitted(
          ids,
          targets.revision(a, ids.place()),
          ids.tick(),
        );
        await insertApplications(h, first);
        const a2 = submitted(ids, targets.listing(a, ids.place()), ids.tick());
        await insertApplications(h, a2);
        await storeThroughSaved(h, first.id, steps.returned(ids.tick()));
        await storeThroughSaved(h, first.id, steps.resubmitted(ids.tick()));
        const result = await query(h, (r) =>
          r.findPageByApplicants({ individual: a, places: [] }, ALL),
        );
        expect(idsOf(result.items)).toEqual([a2.id, first.id]);
      });

      it("applicationRepository#49 同じ submittedAt の A の申請が2件保存されている / A で呼ぶ", async () => {
        const h = await makeHarness();
        const ids = applicationIds();
        const a = ids.account();
        const at = ids.tick();
        const two = [
          submitted(ids, targets.revision(a, ids.place()), at),
          submitted(ids, targets.listing(a, ids.place()), at),
        ];
        await insertApplications(h, ...[...two].reverse());
        const result = await query(h, (r) =>
          r.findPageByApplicants({ individual: a, places: [] }, ALL),
        );
        expect(result.items).toEqual(two);
      });

      it("applicationRepository#50 { individual: null; places: [] } / 呼ぶ", async () => {
        const h = await makeHarness();
        const ids = applicationIds();
        await insertApplications(
          h,
          submitted(ids, targets.revision(ids.account(), ids.place())),
        );
        expect(
          await query(h, (r) =>
            r.findPageByApplicants({ individual: null, places: [] }, ALL),
          ),
        ).toEqual({ items: [], count: 0 });
      });

      async function applicantsWith(n: number) {
        const h = await makeHarness();
        const ids = applicationIds();
        const a = ids.account();
        const apps = Array.from({ length: n }, () =>
          submitted(ids, targets.listing(a, ids.place()), ids.tick()),
        );
        await insertApplications(h, ...apps);
        const newestFirst = [...apps].reverse();
        const call = (pagination: Pagination) =>
          query(h, (r) =>
            r.findPageByApplicants({ individual: a, places: [] }, pagination),
          );
        return { newestFirst, call };
      }

      it("applicationRepository#51 条件に合う申請が0件 / page: 1、limit: 10 で呼ぶ", async () => {
        const { call } = await applicantsWith(0);
        expect(await call(page(1, 10))).toEqual({ items: [], count: 0 });
      });

      it("applicationRepository#52 条件に合う申請が1件 / page: 1、limit: 10 で呼ぶ", async () => {
        const { call, newestFirst } = await applicantsWith(1);
        expect(await call(page(1, 10))).toEqual({
          items: newestFirst,
          count: 1,
        });
      });

      it("applicationRepository#53 条件に合う申請が3件 / page: 1、limit: 3 で呼ぶ", async () => {
        const { call, newestFirst } = await applicantsWith(3);
        expect(await call(page(1, 3))).toEqual({
          items: newestFirst,
          count: 3,
        });
      });

      it("applicationRepository#54 条件に合う申請が5件 / limit: 3 で、page: 1 と page: 2 を呼ぶ", async () => {
        const { call, newestFirst } = await applicantsWith(5);
        expect(await call(page(1, 3))).toEqual({
          items: newestFirst.slice(0, 3),
          count: 5,
        });
        expect(await call(page(2, 3))).toEqual({
          items: newestFirst.slice(3),
          count: 5,
        });
      });

      it("applicationRepository#55 条件に合う申請が5件 / page: 3、limit: 3 で呼ぶ", async () => {
        const { call } = await applicantsWith(5);
        expect(await call(page(3, 3))).toEqual({ items: [], count: 5 });
      });

      it("applicationRepository#56 101店舗のそれぞれについて店舗管理者として行った申請が1件ずつ保存されている / 101件の places で呼ぶ", async () => {
        const h = await makeHarness();
        const ids = applicationIds();
        const x = ids.region();
        const places = Array.from({ length: 101 }, () => ids.place());
        await insertApplications(
          h,
          ...places.map((p) => submitted(ids, targets.affiliation(p, x))),
        );
        const result = await query(h, (r) =>
          r.findPageByApplicants({ individual: null, places }, ALL),
        );
        expect(result.count).toBe(101);
        expect(result.items).toHaveLength(100);
      });
    });

    describe("findPageBySubject", () => {
      async function regionSetup() {
        const h = await makeHarness();
        const ids = applicationIds();
        const x = ids.region();
        const affiliate = () =>
          submitted(ids, targets.affiliation(ids.place(), x), ids.tick());
        const x1 = approved(affiliate(), ids.tick());
        const x2 = affiliate();
        const x3 = rejected(affiliate(), ids.tick());
        const x4 = returned(affiliate(), ids.tick());
        await insertApplications(h, x1, x2, x3, x4);
        return { h, x, x1, x2, x3, x4 };
      }

      it('applicationRepository#57 地域 X に、所属の申請 x1（最も先に提出、承認）、x2（次に提出、確認中）、x3（次に提出、否認）、x4（最後に提出、差し戻し）が保存されている / { kind: "region"; id: X }、filter なしで呼ぶ', async () => {
        const { h, x, x1, x2, x3, x4 } = await regionSetup();
        const result = await query(h, (r) =>
          r.findPageBySubject({ kind: "region", id: x }, {}, ALL),
        );
        expect(result).toEqual({ items: [x4, x2, x3, x1], count: 4 });
      });

      it('applicationRepository#58 同上 / statuses: ["underReview"] で呼ぶ', async () => {
        const { h, x, x2 } = await regionSetup();
        const result = await query(h, (r) =>
          r.findPageBySubject(
            { kind: "region", id: x },
            { statuses: ["underReview"] },
            ALL,
          ),
        );
        expect(result).toEqual({ items: [x2], count: 1 });
      });

      it('applicationRepository#59 地域 X に、所属の申請と離脱の申請が保存されている / kinds: ["leave"] で呼ぶ', async () => {
        const h = await makeHarness();
        const ids = applicationIds();
        const x = ids.region();
        const leave = submitted(ids, targets.leave(ids.place(), x));
        await insertApplications(
          h,
          submitted(ids, targets.affiliation(ids.place(), x)),
          leave,
        );
        const result = await query(h, (r) =>
          r.findPageBySubject(
            { kind: "region", id: x },
            { kinds: ["leave"] },
            ALL,
          ),
        );
        expect(result).toEqual({ items: [leave], count: 1 });
      });

      async function placeSetup() {
        const h = await makeHarness();
        const ids = applicationIds();
        const p = ids.place();
        const byPlace = submitted(ids, targets.affiliation(p, ids.region()));
        const byPerson = submitted(ids, targets.revision(ids.account(), p));
        await insertApplications(h, byPlace, byPerson);
        return { h, p, byPlace, byPerson };
      }

      it('applicationRepository#60 店舗 P に、店舗管理者として行った所属の申請、A が個人として行った情報修正の申請が保存されている / { kind: "place"; id: P }、applicant: "place" で呼ぶ', async () => {
        const { h, p, byPlace } = await placeSetup();
        expect(
          await query(h, (r) =>
            r.findPageBySubject(
              { kind: "place", id: p },
              { applicant: "place" },
              ALL,
            ),
          ),
        ).toEqual({ items: [byPlace], count: 1 });
      });

      it('applicationRepository#61 同上 / applicant: "individual" で呼ぶ', async () => {
        const { h, p, byPerson } = await placeSetup();
        expect(
          await query(h, (r) =>
            r.findPageBySubject(
              { kind: "place", id: p },
              { applicant: "individual" },
              ALL,
            ),
          ),
        ).toEqual({ items: [byPerson], count: 1 });
      });

      it("applicationRepository#62 店舗 P に、kinds・statuses・applicant のそれぞれに合う申請と合わない申請が保存されている / 3つの項目をすべて指定して呼ぶ", async () => {
        const h = await makeHarness();
        const ids = applicationIds();
        const p = ids.place();
        const a = ids.account();
        const match = submitted(ids, targets.affiliation(p, ids.region(), a));
        await insertApplications(
          h,
          match,
          submitted(ids, targets.revision(a, p)),
          rejected(
            submitted(ids, targets.affiliation(p, ids.region(), ids.account())),
            ids.tick(),
          ),
          submitted(ids, targets.affiliation(p, ids.region())),
        );
        const result = await query(h, (r) =>
          r.findPageBySubject(
            { kind: "place", id: p },
            {
              kinds: ["affiliation"],
              statuses: ["underReview"],
              applicant: "individual",
            },
            ALL,
          ),
        );
        expect(result).toEqual({ items: [match], count: 1 });
      });

      it('applicationRepository#63 登録申請 r を参照する併せた管理権限の申請が、取り下げの s1 と、その後に提出された確認中の s2 で保存されている / { kind: "registration"; id: r } で呼ぶ', async () => {
        const h = await makeHarness();
        const ids = applicationIds();
        const a = ids.account();
        const r = submitted(ids, targets.registration(a));
        const companion = () =>
          submitted(
            ids,
            targets.stewardship(a, r.reservedPlaceId, r.id),
            ids.tick(),
          );
        const s1 = withdrawn(companion(), ids.tick());
        const s2 = companion();
        await insertApplications(h, r, s1, s2);
        expect(
          await query(h, (repo) =>
            repo.findPageBySubject({ kind: "registration", id: r.id }, {}, ALL),
          ),
        ).toEqual({ items: [s2, s1], count: 2 });
      });

      it("applicationRepository#64 進行中の申請が2件、同じ submittedAt で保存されている / 呼ぶ", async () => {
        const h = await makeHarness();
        const ids = applicationIds();
        const p = ids.place();
        const at = ids.tick();
        const two = [
          submitted(ids, targets.revision(ids.account(), p), at),
          submitted(ids, targets.revision(ids.account(), p), at),
        ];
        await insertApplications(h, ...[...two].reverse());
        expect(
          await query(h, (r) =>
            r.findPageBySubject({ kind: "place", id: p }, {}, ALL),
          ),
        ).toEqual({ items: two, count: 2 });
      });

      it("applicationRepository#65 その対象に関わる申請がない / 呼ぶ", async () => {
        const h = await makeHarness();
        const ids = applicationIds();
        await insertApplications(
          h,
          submitted(ids, targets.revision(ids.account(), ids.place())),
        );
        expect(
          await query(h, (r) =>
            r.findPageBySubject({ kind: "place", id: ids.place() }, {}, ALL),
          ),
        ).toEqual({ items: [], count: 0 });
      });

      /** `n` closed and `active` active applications about P, in listing order. */
      async function subjectWith(n: number, active = n) {
        const h = await makeHarness();
        const ids = applicationIds();
        const p = ids.place();
        const apps = Array.from({ length: n }, (_, i) => {
          const app = submitted(
            ids,
            targets.revision(ids.account(), p),
            ids.tick(),
          );
          return i < active ? app : rejected(app, ids.tick());
        });
        await insertApplications(h, ...apps);
        const actives = apps.slice(0, active).reverse();
        const closed = apps.slice(active).reverse();
        const call = (pagination: Pagination) =>
          query(h, (r) =>
            r.findPageBySubject({ kind: "place", id: p }, {}, pagination),
          );
        return { ordered: [...actives, ...closed], call };
      }

      it("applicationRepository#66 条件に合う申請が1件 / page: 1、limit: 10 で呼ぶ", async () => {
        const { call, ordered } = await subjectWith(1);
        expect(await call(page(1, 10))).toEqual({ items: ordered, count: 1 });
      });

      it("applicationRepository#67 条件に合う申請が3件 / page: 1、limit: 3 で呼ぶ", async () => {
        const { call, ordered } = await subjectWith(3);
        expect(await call(page(1, 3))).toEqual({ items: ordered, count: 3 });
      });

      it("applicationRepository#68 条件に合う申請が5件（進行中が2件） / limit: 3 で、page: 1 と page: 2 を呼ぶ", async () => {
        const { call, ordered } = await subjectWith(5, 2);
        const first = await call(page(1, 3));
        expect(first).toEqual({ items: ordered.slice(0, 3), count: 5 });
        expect(first.items.slice(0, 2).map((app) => app.status.kind)).toEqual([
          "underReview",
          "underReview",
        ]);
        expect(await call(page(2, 3))).toEqual({
          items: ordered.slice(3),
          count: 5,
        });
      });

      it("applicationRepository#69 条件に合う申請が5件 / page: 3、limit: 3 で呼ぶ", async () => {
        const { call } = await subjectWith(5);
        expect(await call(page(3, 3))).toEqual({ items: [], count: 5 });
      });
    });

    describe("並行性", () => {
      it("applicationRepository#70 A の情報修正（P）の枠に進行中の申請がない / 2つの UnitOfWork が、同じ枠の申請を、別の ID で同時に insert する", async () => {
        const h = await makeHarness();
        const ids = applicationIds();
        const target = targets.revision(ids.account(), ids.place());
        const bothRead = barrier(2);
        const attempt = (app: TestApplication) =>
          h.run(async ({ applicationRepository }) => {
            expect(
              await applicationRepository.findActiveBySlot(slotOf(target)),
            ).toBeNull();
            await bothRead();
            await applicationRepository.insert(app);
          });
        const results = await Promise.allSettled([
          attempt(submitted(ids, target)),
          attempt(submitted(ids, target)),
        ]);
        const rejectedResults = results.filter(
          (r): r is PromiseRejectedResult => r.status === "rejected",
        );
        expect(rejectedResults).toHaveLength(1);
        expect(rejectedResults[0]?.reason).toBeInstanceOf(ConflictError);
        expect(
          (
            await query(h, (r) =>
              r.findPageBySubject(
                { kind: "place", id: target.placeId },
                { statuses: ["underReview", "returned"] },
                ALL,
              ),
            )
          ).count,
        ).toBe(1);
      });

      it("applicationRepository#71 申請が保存されていない / 2つの UnitOfWork が、同じ ID の申請を同時に insert する", async () => {
        const h = await makeHarness();
        const ids = applicationIds();
        const id = ids.application();
        const bothRead = barrier(2);
        const attempt = (app: TestApplication) =>
          h.run(async ({ applicationRepository }) => {
            expect(await applicationRepository.findById(id)).toBeNull();
            await bothRead();
            await applicationRepository.insert(app);
          });
        const results = await Promise.allSettled([
          attempt(
            submitted(
              ids,
              targets.listing(ids.account(), ids.place()),
              ids.tick(),
              {},
              id,
            ),
          ),
          attempt(
            submitted(
              ids,
              targets.listing(ids.account(), ids.place()),
              ids.tick(),
              {},
              id,
            ),
          ),
        ]);
        const rejectedResults = results.filter(
          (r): r is PromiseRejectedResult => r.status === "rejected",
        );
        expect(rejectedResults).toHaveLength(1);
        expect(rejectedResults[0]?.reason).toBeInstanceOf(ConflictError);
        expect(await findApplication(h, id)).not.toBeNull();
      });

      it("applicationRepository#72 確認中の申請が保存されている / 2つの UnitOfWork が、同じ expectedVersion で、承認にした申請と取り下げにした申請を同時に save する", async () => {
        const h = await makeHarness();
        const ids = applicationIds();
        const app = submitted(
          ids,
          targets.revision(ids.account(), ids.place()),
        );
        await insertApplications(h, app);
        await expectOneWinner(
          h,
          await raceSaves(
            h,
            app.id,
            steps.approved(ids.tick()),
            steps.withdrawn(ids.tick()),
          ),
        );
      });

      it("applicationRepository#73 確認中の申請が保存されている / 2つの UnitOfWork が、同じ expectedVersion で、承認にした申請と否認にした申請を同時に save する（2人の承認者）", async () => {
        const h = await makeHarness();
        const ids = applicationIds();
        const app = submitted(
          ids,
          targets.affiliation(ids.place(), ids.region()),
        );
        await insertApplications(h, app);
        await expectOneWinner(
          h,
          await raceSaves(
            h,
            app.id,
            steps.approved(ids.tick()),
            steps.rejected(ids.tick()),
          ),
        );
      });

      it("applicationRepository#74 差し戻しの申請が保存されている / 2つの UnitOfWork が、同じ expectedVersion で、再提出した申請と取り下げにした申請を同時に save する（2人の店舗管理者）", async () => {
        const h = await makeHarness();
        const ids = applicationIds();
        const back = await storeThrough(
          h,
          submitted(ids, targets.affiliation(ids.place(), ids.region())),
          steps.returned(ids.tick()),
        );
        await expectOneWinner(
          h,
          await raceSaves(
            h,
            back.id,
            steps.resubmitted(ids.tick()),
            steps.withdrawn(ids.tick()),
          ),
        );
      });

      it("applicationRepository#75 確認中の申請が保存されている / 2つの UnitOfWork が、同じ expectedVersion で、否認にした申請と失効にした申請を同時に save する", async () => {
        const h = await makeHarness();
        const ids = applicationIds();
        const app = submitted(
          ids,
          targets.revision(ids.account(), ids.place()),
        );
        await insertApplications(h, app);
        await expectOneWinner(
          h,
          await raceSaves(
            h,
            app.id,
            steps.rejected(ids.tick()),
            steps.lapsed(ids.tick()),
          ),
        );
      });
    });

    describe("可視性と UnitOfWork", () => {
      async function everyRead(h: ApplicationHarness, app: TestApplication) {
        if (app.target.kind !== "revision") throw new Error("a revision");
        const { placeId, applicant } = app.target;
        if (applicant.kind !== "individual") throw new Error("individual");
        return query(h, async (r) => ({
          findById: (await r.findById(app.id))?.entity ?? null,
          findByIds: await r.findByIds([app.id]),
          findActiveBySlot: await r.findActiveBySlot(slotOf(app.target)),
          findActiveBySubject: entities(
            (await r.findActiveBySubject({ kind: "place", id: placeId }, ALL))
              .items,
          ),
          findActiveByIndividual: entities(
            (await r.findActiveByIndividual(applicant.accountId, ALL)).items,
          ),
          findPageByApplicants: (
            await r.findPageByApplicants(
              { individual: applicant.accountId, places: [] },
              ALL,
            )
          ).items,
          findPageBySubject: (
            await r.findPageBySubject({ kind: "place", id: placeId }, {}, ALL)
          ).items,
        }));
      }

      it("applicationRepository#76 申請が保存されていない / UnitOfWork の中で insert してコミットし、直後に findById・findByIds・findActiveBySlot・findActiveBySubject・findActiveByIndividual・findPageByApplicants・findPageBySubject を呼ぶ", async () => {
        const h = await makeHarness();
        const ids = applicationIds();
        const app = submitted(
          ids,
          targets.revision(ids.account(), ids.place()),
        );
        await insertApplications(h, app);
        expect(await everyRead(h, app)).toEqual({
          findById: app,
          findByIds: [app],
          findActiveBySlot: app,
          findActiveBySubject: [app],
          findActiveByIndividual: [app],
          findPageByApplicants: [app],
          findPageBySubject: [app],
        });
      });

      it("applicationRepository#77 確認中の申請が保存されている / UnitOfWork の中で、取り下げにした申請を save してコミットし、直後に同じ問い合わせを呼ぶ", async () => {
        const h = await makeHarness();
        const ids = applicationIds();
        const app = submitted(
          ids,
          targets.revision(ids.account(), ids.place()),
        );
        const gone = await storeThrough(h, app, steps.withdrawn(ids.tick()));
        expect(await everyRead(h, app)).toEqual({
          findById: gone,
          findByIds: [gone],
          findActiveBySlot: null,
          findActiveBySubject: [],
          findActiveByIndividual: [],
          findPageByApplicants: [gone],
          findPageBySubject: [gone],
        });
      });

      it("applicationRepository#78 申請が保存されていない / UnitOfWork の中で insert した後に、fn が例外を投げる", async () => {
        const h = await makeHarness();
        const ids = applicationIds();
        const target = targets.revision(ids.account(), ids.place());
        const app = submitted(ids, target);
        await expect(
          h.run(async ({ applicationRepository }) => {
            await applicationRepository.insert(app);
            throw new ScopeAbort();
          }),
        ).rejects.toBeInstanceOf(ScopeAbort);
        expect(await everyRead(h, app)).toEqual({
          findById: null,
          findByIds: [],
          findActiveBySlot: null,
          findActiveBySubject: [],
          findActiveByIndividual: [],
          findPageByApplicants: [],
          findPageBySubject: [],
        });
        const next = submitted(ids, target);
        await insertApplications(h, next);
        expect((await getApplication(h, next.id)).entity).toEqual(next);
      });

      it("applicationRepository#79 確認中の申請が保存されている / UnitOfWork の中で、否認にした申請を save した後に、fn が例外を投げる", async () => {
        const h = await makeHarness();
        const ids = applicationIds();
        const app = submitted(
          ids,
          targets.revision(ids.account(), ids.place()),
        );
        await insertApplications(h, app);
        await expect(
          h.run(async ({ applicationRepository }) => {
            const read = await applicationRepository.findById(app.id);
            if (read === null) throw new Error("missing");
            await applicationRepository.save(
              steps.rejected(ids.tick())(read.entity),
              read.expectedVersion,
            );
            throw new ScopeAbort();
          }),
        ).rejects.toBeInstanceOf(ScopeAbort);
        const found = await getApplication(h, app.id);
        expect(found.entity).toEqual(app);
        expect(found.expectedVersion).toBe(app.version);
      });

      it("applicationRepository#80 申請が保存されていない / 1つの UnitOfWork の中で、登録申請と、併せた管理権限の申請を insert してコミットする", async () => {
        const h = await makeHarness();
        const ids = applicationIds();
        const a = ids.account();
        const r = submitted(ids, targets.registration(a));
        const s = submitted(
          ids,
          targets.stewardship(a, r.reservedPlaceId, r.id),
        );
        await insertApplications(h, r, s);
        expect((await getApplication(h, r.id)).entity).toEqual(r);
        expect((await getApplication(h, s.id)).entity).toEqual(s);
      });

      it("applicationRepository#81 同じ ID の管理権限の申請がすでに保存されている / 1つの UnitOfWork の中で、登録申請と、その ID の併せた管理権限の申請を insert する", async () => {
        const h = await makeHarness();
        const ids = applicationIds();
        const a = ids.account();
        const taken = submitted(ids, targets.stewardship(a, ids.place()));
        await insertApplications(h, taken);
        const r = submitted(ids, targets.registration(a));
        const s = submitted(
          ids,
          targets.stewardship(a, r.reservedPlaceId, r.id),
          ids.tick(),
          {},
          taken.id,
        );
        await expectConflict(insertApplications(h, r, s));
        expect(await findApplication(h, r.id)).toBeNull();
        expect((await getApplication(h, taken.id)).entity).toEqual(taken);
      });

      it("applicationRepository#82 申請 a1 と a2 が保存されている / 1つの UnitOfWork の中で、a1 を save し、a2 を古い expectedVersion で save する", async () => {
        const h = await makeHarness();
        const ids = applicationIds();
        const a1 = submitted(ids, targets.revision(ids.account(), ids.place()));
        const a2 = submitted(ids, targets.revision(ids.account(), ids.place()));
        await insertApplications(h, a1, a2);
        const stale = await getApplication(h, a2.id);
        await storeThroughSaved(h, a2.id, steps.returned(ids.tick()));
        const fresh = await getApplication(h, a1.id);
        await expectConflict(
          h.run(async ({ applicationRepository }) => {
            await applicationRepository.save(
              steps.returned(ids.tick())(fresh.entity),
              fresh.expectedVersion,
            );
            await applicationRepository.save(
              steps.withdrawn(ids.tick())(stale.entity),
              stale.expectedVersion,
            );
          }),
        );
        expect((await getApplication(h, a1.id)).entity).toEqual(a1);
      });
    });
  });
}

/** Reads `id` and saves `step` of it. */
async function storeThroughSaved(
  h: ApplicationHarness,
  id: TestApplication["id"],
  step: (app: TestApplication) => TestApplication,
): Promise<void> {
  const read = await getApplication(h, id);
  await saveApplication(h, step(read.entity), read.expectedVersion);
}
