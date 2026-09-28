import { ConflictError, NotFoundError } from "@repo/core/application/errors";
import type { PlaceId } from "@repo/core/domain/common/ids";
import type {
  ConfirmationRequestedInfoReport,
  InfoReport,
  OpenInfoReport,
} from "@repo/core/domain/moderation/infoReport";
import { describe, expect, it } from "vitest";
import { barrier, ScopeAbort } from "./fixtures";
import type { HarnessFactory } from "./harness";
import {
  findReport,
  findRequestedByPlace,
  findUnresolvedReports,
  getReport,
  idsOf,
  insertReports,
  type ModerationSamples,
  moderationSamples,
  page,
  saveReport,
} from "./moderationFixtures";

const T0 = Date.parse("2026-09-01T00:00:00.000Z");
const at = (minutes: number): Date => new Date(T0 + minutes * 60_000);

const aboutPlace = (s: ModerationSamples, placeId: PlaceId) =>
  s.openReport({ target: { kind: "place", placeId } });

/** `count` confirmation-requested reports of `placeId`, requested in mint order. */
const requestedOf = (
  s: ModerationSamples,
  placeId: PlaceId,
  count: number,
): readonly ConfirmationRequestedInfoReport[] =>
  Array.from({ length: count }, () => s.requested(aboutPlace(s, placeId)));

/** `spec/testcases/ports/infoReportRepository.md`. */
export function describeInfoReportRepositoryContract(
  makeHarness: HarnessFactory,
): void {
  describe("InfoReportRepository contract", () => {
    describe("insert・findById・save", () => {
      it("infoReportRepository#1 連絡が保存されていない / 店舗を対象にした未対応の連絡を insert し、findById で読む", async () => {
        const h = await makeHarness();
        const s = moderationSamples();
        const placeId = s.ids.place();
        const report = aboutPlace(s, placeId);
        await insertReports(h, report);
        const found = await getReport(h, report.id);
        expect(found.entity).toEqual(report);
        expect(found.entity.target).toEqual({ kind: "place", placeId });
        expect(found.entity.status).toBe("open");
        expect("request" in found.entity).toBe(false);
        expect(typeof found.expectedVersion).toBe("number");
      });

      it("infoReportRepository#2 連絡が保存されていない / 掲載を対象にした、種類が閉店の未対応の連絡を insert し、findById で読む", async () => {
        const h = await makeHarness();
        const s = moderationSamples();
        const target = {
          kind: "listing",
          placeId: s.ids.place(),
          listingId: s.ids.listing(),
        } as const;
        const report = s.openReport({ target, category: "closure" });
        await insertReports(h, report);
        const found = (await getReport(h, report.id)).entity;
        expect(found.target).toEqual(target);
        expect(found.category).toBe("closure");
      });

      it("infoReportRepository#3 連絡が保存されていない / findById を呼ぶ", async () => {
        const h = await makeHarness();
        expect(
          await findReport(h, moderationSamples().ids.report()),
        ).toBeNull();
      });

      it("infoReportRepository#4 ID が同じ連絡が保存されている / 同じ ID の連絡を insert する", async () => {
        const h = await makeHarness();
        const s = moderationSamples();
        const report = s.openReport();
        await insertReports(h, report);
        await expect(
          insertReports(
            h,
            s.openReport({ id: report.id, content: "別の内容" }),
          ),
        ).rejects.toBeInstanceOf(ConflictError);
        expect((await getReport(h, report.id)).entity).toEqual(report);
      });

      it("infoReportRepository#5 連絡が保存されている / 別の ID で、連絡した人・対象・種類・内容が同じ連絡を insert する", async () => {
        const h = await makeHarness();
        const s = moderationSamples();
        const first = s.openReport();
        const second = s.openReport({
          target: first.target,
          reporter: first.reporter,
          category: first.category,
          content: first.content,
        });
        await insertReports(h, first);
        await insertReports(h, second);
        expect((await getReport(h, first.id)).entity).toEqual(first);
        expect((await getReport(h, second.id)).entity).toEqual(second);
      });

      it("infoReportRepository#6 連絡が保存されていない / どの集約も指さない placeId・listingId・連絡した人の AccountId を持つ連絡を insert する", async () => {
        const h = await makeHarness();
        const s = moderationSamples();
        const report = s.openReport({
          target: {
            kind: "listing",
            placeId: s.ids.place(),
            listingId: s.ids.listing(),
          },
          reporter: s.ids.account(),
        });
        await insertReports(h, report);
        expect((await getReport(h, report.id)).entity).toEqual(report);
      });

      it("infoReportRepository#7 未対応の連絡が保存されている / findById の expectedVersion で、requestConfirmation した連絡を save し、findById で読む", async () => {
        const h = await makeHarness();
        const s = moderationSamples();
        const report = s.openReport();
        await insertReports(h, report);
        const read = await getReport(h, report.id);
        const requestedAt = at(90);
        const requested = s.requested(report, requestedAt);
        await saveReport(h, requested, read.expectedVersion);
        const found = (await getReport(h, report.id)).entity;
        expect(found).toEqual(requested);
        expect(found).toMatchObject({
          status: "confirmationRequested",
          request: { requestedAt },
          target: report.target,
          category: report.category,
          content: report.content,
          reporter: report.reporter,
          receivedAt: report.receivedAt,
        });
        expect(found.version).toBe(report.version + 1);
      });

      it("infoReportRepository#8 未対応の連絡が保存されている / resolve した連絡を save し、findById で読む", async () => {
        const h = await makeHarness();
        const s = moderationSamples();
        const report = s.openReport();
        await insertReports(h, report);
        const read = await getReport(h, report.id);
        await saveReport(h, s.resolvedReport(report), read.expectedVersion);
        expect((await getReport(h, report.id)).entity).toMatchObject({
          status: "resolved",
          request: null,
        });
      });

      it("infoReportRepository#9 確認依頼中の連絡が保存されている / resolve した連絡を save し、findById で読む", async () => {
        const h = await makeHarness();
        const s = moderationSamples();
        const requested = s.requested(s.openReport(), at(90));
        await insertReports(h, requested);
        const read = await getReport(h, requested.id);
        await saveReport(h, s.resolvedReport(requested), read.expectedVersion);
        expect((await getReport(h, requested.id)).entity).toMatchObject({
          status: "resolved",
          request: { requestedAt: at(90) },
        });
      });

      it("infoReportRepository#10 未対応の連絡が保存されている。findById の後に、別の save がコミットされた / 古い expectedVersion で save する", async () => {
        const h = await makeHarness();
        const s = moderationSamples();
        const report = s.openReport();
        await insertReports(h, report);
        const read = await getReport(h, report.id);
        const first = s.requested(report);
        await saveReport(h, first, read.expectedVersion);
        await expect(
          saveReport(h, s.resolvedReport(report), read.expectedVersion),
        ).rejects.toBeInstanceOf(ConflictError);
        expect((await getReport(h, report.id)).entity).toEqual(first);
      });

      it("infoReportRepository#11 連絡が保存されていない / その ID の連絡を save する", async () => {
        const h = await makeHarness();
        const s = moderationSamples();
        const [other, report] = [s.openReport(), s.openReport()];
        await insertReports(h, other);
        const token = (await getReport(h, other.id)).expectedVersion;
        await expect(
          saveReport(h, s.resolvedReport(report), token),
        ).rejects.toBeInstanceOf(NotFoundError);
        expect(await findReport(h, report.id)).toBeNull();
      });
    });

    describe("findUnresolved", () => {
      it("infoReportRepository#12 連絡が保存されていない / page: 1、limit: 10 で findUnresolved を呼ぶ", async () => {
        const h = await makeHarness();
        expect(await findUnresolvedReports(h, page(1, 10))).toEqual({
          items: [],
          count: 0,
        });
      });

      it("infoReportRepository#13 未対応の連絡が1件保存されている / page: 1、limit: 10 で findUnresolved を呼ぶ", async () => {
        const h = await makeHarness();
        const report = moderationSamples().openReport();
        await insertReports(h, report);
        expect(await findUnresolvedReports(h, page(1, 10))).toEqual({
          items: [report],
          count: 1,
        });
      });

      it("infoReportRepository#14 未対応、確認依頼中、依頼を経た対応済み、依頼を経ない対応済みの連絡が1件ずつ保存されている / findUnresolved を呼ぶ", async () => {
        const h = await makeHarness();
        const s = moderationSamples();
        const open = s.openReport();
        const requested = s.requested(s.openReport());
        await insertReports(
          h,
          open,
          requested,
          s.resolvedReport(s.requested(s.openReport())),
          s.resolvedReport(s.openReport()),
        );
        const found = await findUnresolvedReports(h);
        expect(found.items).toEqual([open, requested]);
        expect(found.count).toBe(2);
      });

      it("infoReportRepository#15 receivedAt が互いに違う未対応と確認依頼中の連絡が計3件、receivedAt の順と違う順で insert されている / findUnresolved を呼ぶ", async () => {
        const h = await makeHarness();
        const s = moderationSamples();
        const early = s.requested(s.openReport({ at: at(10) }), at(100));
        const middle = s.openReport({ at: at(20) });
        const late = s.requested(s.openReport({ at: at(30) }), at(40));
        await insertReports(h, late, middle, early);
        expect(idsOf((await findUnresolvedReports(h)).items)).toEqual([
          early.id,
          middle.id,
          late.id,
        ]);
      });

      it("infoReportRepository#16 receivedAt が同じで ID の違う未対応の連絡が2件保存されている / findUnresolved を呼ぶ", async () => {
        const h = await makeHarness();
        const s = moderationSamples();
        const [lower, higher] = [s.ids.report(), s.ids.report()];
        await insertReports(
          h,
          s.openReport({ id: higher, at: at(5) }),
          s.openReport({ id: lower, at: at(5) }),
        );
        expect(idsOf((await findUnresolvedReports(h)).items)).toEqual([
          lower,
          higher,
        ]);
      });

      it("infoReportRepository#17 対応を終えていない連絡が3件保存されている / page: 1、limit: 3 で findUnresolved を呼ぶ", async () => {
        const h = await makeHarness();
        const s = moderationSamples();
        await insertReports(
          h,
          s.openReport(),
          s.requested(s.openReport()),
          s.openReport(),
        );
        const found = await findUnresolvedReports(h, page(1, 3));
        expect(found.items).toHaveLength(3);
        expect(found.count).toBe(3);
      });

      it("infoReportRepository#18 対応を終えていない連絡が5件保存されている / limit: 3 で、page: 1 と page: 2 を呼ぶ", async () => {
        const h = await makeHarness();
        const s = moderationSamples();
        const reports = Array.from({ length: 5 }, (_, i) =>
          i % 2 === 0 ? s.openReport() : s.requested(s.openReport()),
        );
        await insertReports(h, ...reports);
        const first = await findUnresolvedReports(h, page(1, 3));
        const second = await findUnresolvedReports(h, page(2, 3));
        expect(idsOf(first.items)).toEqual(idsOf(reports.slice(0, 3)));
        expect(idsOf(second.items)).toEqual(idsOf(reports.slice(3)));
        expect([first.count, second.count]).toEqual([5, 5]);
      });

      it("infoReportRepository#19 対応を終えていない連絡が5件保存されている / page: 3、limit: 3 で findUnresolved を呼ぶ", async () => {
        const h = await makeHarness();
        const s = moderationSamples();
        await insertReports(
          h,
          ...Array.from({ length: 5 }, () => s.openReport()),
        );
        expect(await findUnresolvedReports(h, page(3, 3))).toEqual({
          items: [],
          count: 5,
        });
      });

      it("infoReportRepository#20 対応を終えていない連絡が100件保存されている / page: 1、limit: 100 で findUnresolved を呼ぶ", async () => {
        const h = await makeHarness();
        const s = moderationSamples();
        const reports = Array.from({ length: 100 }, () => s.openReport());
        await insertReports(h, ...reports);
        const found = await findUnresolvedReports(h, page(1, 100));
        expect(idsOf(found.items)).toEqual(idsOf(reports));
        expect(found.count).toBe(100);
      });

      it("infoReportRepository#21 対応を終えていない連絡が5件、対応済みの連絡が2件保存されている / page: 1、limit: 3 で findUnresolved を呼ぶ", async () => {
        const h = await makeHarness();
        const s = moderationSamples();
        await insertReports(
          h,
          ...Array.from({ length: 5 }, () => s.openReport()),
          s.resolvedReport(s.openReport()),
          s.resolvedReport(s.requested(s.openReport())),
        );
        const found = await findUnresolvedReports(h, page(1, 3));
        expect(found.items).toHaveLength(3);
        expect(found.count).toBe(5);
      });
    });

    describe("findConfirmationRequestedByPlace", () => {
      it("infoReportRepository#22 店舗 P の連絡が保存されていない / P の placeId で呼ぶ", async () => {
        const h = await makeHarness();
        const s = moderationSamples();
        await insertReports(h, s.requested(s.openReport()));
        expect(await findRequestedByPlace(h, s.ids.place())).toEqual({
          items: [],
          count: 0,
        });
      });

      it("infoReportRepository#23 店舗 P を対象にした確認依頼中の連絡が1件保存されている / P の placeId で、page: 1、limit: 10 で呼ぶ", async () => {
        const h = await makeHarness();
        const s = moderationSamples();
        const P = s.ids.place();
        const report = s.requested(aboutPlace(s, P));
        await insertReports(h, report);
        expect(await findRequestedByPlace(h, P, page(1, 10))).toEqual({
          items: [report],
          count: 1,
        });
      });

      it("infoReportRepository#24 店舗 P を対象にした確認依頼中の連絡と、P の掲載を対象にした確認依頼中の連絡（target.placeId が P）が保存されている / P の placeId で呼ぶ", async () => {
        const h = await makeHarness();
        const s = moderationSamples();
        const P = s.ids.place();
        const onPlace = s.requested(aboutPlace(s, P));
        const onListing = s.requested(
          s.openReport({
            target: { kind: "listing", placeId: P, listingId: s.ids.listing() },
          }),
        );
        await insertReports(h, onPlace, onListing);
        const found = await findRequestedByPlace(h, P);
        expect(idsOf(found.items)).toEqual([onListing.id, onPlace.id]);
        expect(found.count).toBe(2);
      });

      it("infoReportRepository#25 店舗 P に、未対応、確認依頼中、依頼を経た対応済みの連絡が1件ずつ保存されている / P の placeId で呼ぶ", async () => {
        const h = await makeHarness();
        const s = moderationSamples();
        const P = s.ids.place();
        const requested = s.requested(aboutPlace(s, P));
        await insertReports(
          h,
          aboutPlace(s, P),
          requested,
          s.resolvedReport(s.requested(aboutPlace(s, P))),
        );
        expect(await findRequestedByPlace(h, P)).toEqual({
          items: [requested],
          count: 1,
        });
      });

      it("infoReportRepository#26 店舗 P と店舗 Q に、確認依頼中の連絡が1件ずつ保存されている / P の placeId で呼ぶ", async () => {
        const h = await makeHarness();
        const s = moderationSamples();
        const [P, Q] = [s.ids.place(), s.ids.place()];
        const ofP = s.requested(aboutPlace(s, P));
        const ofQ = s.requested(aboutPlace(s, Q));
        await insertReports(h, ofP, ofQ);
        expect(await findRequestedByPlace(h, P)).toEqual({
          items: [ofP],
          count: 1,
        });
      });

      it("infoReportRepository#27 店舗 P に、request.requestedAt が互いに違う確認依頼中の連絡が3件保存されている。receivedAt の順は requestedAt の順と違う / P の placeId で呼ぶ", async () => {
        const h = await makeHarness();
        const s = moderationSamples();
        const P = s.ids.place();
        const [r1, r2, r3] = [
          aboutPlace(s, P),
          aboutPlace(s, P),
          aboutPlace(s, P),
        ];
        const requested = [
          s.requested(r3, at(100)),
          s.requested(r1, at(200)),
          s.requested(r2, at(300)),
        ];
        await insertReports(h, ...requested);
        expect(idsOf((await findRequestedByPlace(h, P)).items)).toEqual([
          r2.id,
          r1.id,
          r3.id,
        ]);
      });

      it("infoReportRepository#28 店舗 P に、request.requestedAt が同じで ID の違う確認依頼中の連絡が2件保存されている / P の placeId で呼ぶ", async () => {
        const h = await makeHarness();
        const s = moderationSamples();
        const P = s.ids.place();
        const [lower, higher] = [aboutPlace(s, P), aboutPlace(s, P)];
        await insertReports(
          h,
          s.requested(higher, at(100)),
          s.requested(lower, at(100)),
        );
        expect(idsOf((await findRequestedByPlace(h, P)).items)).toEqual([
          lower.id,
          higher.id,
        ]);
      });

      it("infoReportRepository#29 店舗 P に確認依頼中の連絡が3件保存されている / page: 1、limit: 3 で呼ぶ", async () => {
        const h = await makeHarness();
        const s = moderationSamples();
        const P = s.ids.place();
        await insertReports(h, ...requestedOf(s, P, 3));
        const found = await findRequestedByPlace(h, P, page(1, 3));
        expect(found.items).toHaveLength(3);
        expect(found.count).toBe(3);
      });

      it("infoReportRepository#30 店舗 P に確認依頼中の連絡が5件保存されている / limit: 3 で、page: 1 と page: 2 を呼ぶ", async () => {
        const h = await makeHarness();
        const s = moderationSamples();
        const P = s.ids.place();
        const reports = requestedOf(s, P, 5);
        await insertReports(h, ...reports);
        const newestFirst = idsOf([...reports].reverse());
        const first = await findRequestedByPlace(h, P, page(1, 3));
        const second = await findRequestedByPlace(h, P, page(2, 3));
        expect(idsOf(first.items)).toEqual(newestFirst.slice(0, 3));
        expect(idsOf(second.items)).toEqual(newestFirst.slice(3));
        expect([first.count, second.count]).toEqual([5, 5]);
      });

      it("infoReportRepository#31 店舗 P に確認依頼中の連絡が5件保存されている / page: 3、limit: 3 で呼ぶ", async () => {
        const h = await makeHarness();
        const s = moderationSamples();
        const P = s.ids.place();
        await insertReports(h, ...requestedOf(s, P, 5));
        expect(await findRequestedByPlace(h, P, page(3, 3))).toEqual({
          items: [],
          count: 5,
        });
      });

      it("infoReportRepository#32 店舗 P に確認依頼中の連絡が100件保存されている / page: 1、limit: 100 で呼ぶ", async () => {
        const h = await makeHarness();
        const s = moderationSamples();
        const P = s.ids.place();
        const reports = requestedOf(s, P, 100);
        await insertReports(h, ...reports);
        const found = await findRequestedByPlace(h, P, page(1, 100));
        expect(idsOf(found.items)).toEqual(idsOf([...reports].reverse()));
        expect(found.count).toBe(100);
      });
    });

    describe("並行性", () => {
      it("infoReportRepository#33 未対応の連絡が保存されている / 2つの UnitOfWork が、同じ expectedVersion で、一方は requestConfirmation した連絡を、他方は resolve した連絡を、同時に save する", async () => {
        const h = await makeHarness();
        const s = moderationSamples();
        const report = s.openReport();
        await insertReports(h, report);
        const bothRead = barrier(2);
        const attempt = (change: (r: OpenInfoReport) => InfoReport) =>
          h.uow.run(async ({ infoReportRepository }) => {
            const read = await infoReportRepository.findById(report.id);
            if (read === null) throw new Error("no report");
            await bothRead();
            await infoReportRepository.save(
              change(report),
              read.expectedVersion,
            );
          });
        const results = await Promise.allSettled([
          attempt((r) => s.requested(r)),
          attempt((r) => s.resolvedReport(r)),
        ]);
        const won = results.findIndex((r) => r.status === "fulfilled");
        expect(won).not.toBe(-1);
        expect(
          results.find((r) => r.status === "rejected")?.reason,
        ).toBeInstanceOf(ConflictError);
        expect((await getReport(h, report.id)).entity.status).toBe(
          won === 0 ? "confirmationRequested" : "resolved",
        );
      });

      it("infoReportRepository#34 連絡が保存されていない / 2つの UnitOfWork が、同じ ID の連絡を同時に insert する", async () => {
        const h = await makeHarness();
        const s = moderationSamples();
        const id = s.ids.report();
        const [a, b] = [
          s.openReport({ id, content: "内容A" }),
          s.openReport({ id, content: "内容B" }),
        ];
        const bothRead = barrier(2);
        const attempt = (report: OpenInfoReport) =>
          h.uow.run(async ({ infoReportRepository }) => {
            await infoReportRepository.findById(id);
            await bothRead();
            await infoReportRepository.insert(report);
          });
        const results = await Promise.allSettled([attempt(a), attempt(b)]);
        const won = results.findIndex((r) => r.status === "fulfilled");
        expect(won).not.toBe(-1);
        expect(
          results.find((r) => r.status === "rejected")?.reason,
        ).toBeInstanceOf(ConflictError);
        expect((await getReport(h, id)).entity).toEqual(won === 0 ? a : b);
        expect((await findUnresolvedReports(h)).count).toBe(1);
      });
    });

    describe("可視性と UnitOfWork", () => {
      it("infoReportRepository#35 連絡が保存されていない / UnitOfWork の中で未対応の連絡を insert してコミットし、直後に findById と findUnresolved を呼ぶ", async () => {
        const h = await makeHarness();
        const s = moderationSamples();
        const P = s.ids.place();
        const report = aboutPlace(s, P);
        await insertReports(h, report);
        expect((await getReport(h, report.id)).entity).toEqual(report);
        expect((await findUnresolvedReports(h)).items).toEqual([report]);
        expect((await findRequestedByPlace(h, P)).count).toBe(0);
      });

      it("infoReportRepository#36 未対応の連絡が保存されている / UnitOfWork の中で、requestConfirmation した連絡を save してコミットし、直後に findById・findUnresolved・findConfirmationRequestedByPlace を呼ぶ", async () => {
        const h = await makeHarness();
        const s = moderationSamples();
        const P = s.ids.place();
        const report = aboutPlace(s, P);
        await insertReports(h, report);
        const read = await getReport(h, report.id);
        const requested = s.requested(report);
        await saveReport(h, requested, read.expectedVersion);
        expect((await getReport(h, report.id)).entity).toEqual(requested);
        expect((await findUnresolvedReports(h)).items).toEqual([requested]);
        expect((await findRequestedByPlace(h, P)).items).toEqual([requested]);
      });

      it("infoReportRepository#37 確認依頼中の連絡が保存されている / UnitOfWork の中で、resolve した連絡を save してコミットし、直後に findById・findUnresolved・findConfirmationRequestedByPlace を呼ぶ", async () => {
        const h = await makeHarness();
        const s = moderationSamples();
        const P = s.ids.place();
        const requested = s.requested(aboutPlace(s, P));
        await insertReports(h, requested);
        const read = await getReport(h, requested.id);
        await saveReport(h, s.resolvedReport(requested), read.expectedVersion);
        expect((await getReport(h, requested.id)).entity.status).toBe(
          "resolved",
        );
        expect((await findUnresolvedReports(h)).count).toBe(0);
        expect((await findRequestedByPlace(h, P)).count).toBe(0);
      });

      it("infoReportRepository#38 連絡が保存されていない / UnitOfWork の中で insert した後に、fn が例外を投げる", async () => {
        const h = await makeHarness();
        const report = moderationSamples().openReport();
        const abort = new ScopeAbort();
        await expect(
          h.uow.run(async ({ infoReportRepository }) => {
            await infoReportRepository.insert(report);
            throw abort;
          }),
        ).rejects.toBe(abort);
        expect(await findReport(h, report.id)).toBeNull();
        expect((await findUnresolvedReports(h)).count).toBe(0);
      });

      it("infoReportRepository#39 未対応の連絡が保存されている / UnitOfWork の中で、requestConfirmation した連絡を save した後に、fn が例外を投げる", async () => {
        const h = await makeHarness();
        const s = moderationSamples();
        const P = s.ids.place();
        const report = aboutPlace(s, P);
        await insertReports(h, report);
        const read = await getReport(h, report.id);
        const abort = new ScopeAbort();
        await expect(
          h.uow.run(async ({ infoReportRepository }) => {
            await infoReportRepository.save(
              s.requested(report),
              read.expectedVersion,
            );
            throw abort;
          }),
        ).rejects.toBe(abort);
        const after = await getReport(h, report.id);
        expect(after.entity).toEqual(report);
        expect(after.expectedVersion).toBe(read.expectedVersion);
        expect((await findRequestedByPlace(h, P)).count).toBe(0);
      });

      it("infoReportRepository#40 未対応の連絡 A と、連絡 B が保存されている / 1つの UnitOfWork の中で、resolve した A を save し、B と同じ ID の連絡を insert する", async () => {
        const h = await makeHarness();
        const s = moderationSamples();
        const [a, b] = [s.openReport(), s.openReport()];
        await insertReports(h, a, b);
        const readA = await getReport(h, a.id);
        await expect(
          h.uow.run(async ({ infoReportRepository }) => {
            await infoReportRepository.save(
              s.resolvedReport(a),
              readA.expectedVersion,
            );
            await infoReportRepository.insert(
              s.openReport({ id: b.id, content: "別の内容" }),
            );
          }),
        ).rejects.toBeInstanceOf(ConflictError);
        expect((await getReport(h, a.id)).entity).toEqual(a);
        expect((await getReport(h, b.id)).entity).toEqual(b);
      });
    });
  });
}
