import { ConflictError, NotFoundError } from "@repo/core/application/errors";
import type { ContentRef } from "@repo/core/domain/common/refs";
import { describe, expect, it } from "vitest";
import { barrier, ScopeAbort } from "./fixtures";
import type { HarnessFactory } from "./harness";
import {
  findClaim,
  findOpenClaims,
  getClaim,
  idsOf,
  insertClaims,
  moderationSamples,
  page,
  saveClaim,
} from "./moderationFixtures";

const T0 = Date.parse("2026-09-01T00:00:00.000Z");
const at = (minutes: number): Date => new Date(T0 + minutes * 60_000);

/** `spec/testcases/ports/takedownClaimRepository.md`. */
export function describeTakedownClaimRepositoryContract(
  makeHarness: HarnessFactory,
): void {
  describe("TakedownClaimRepository contract", () => {
    describe("insert・findById・save", () => {
      it("takedownClaimRepository#1 申立てが保存されていない / 店舗本人が店舗を対象にした未対応の申立てを insert し、findById で読む", async () => {
        const h = await makeHarness();
        const s = moderationSamples();
        const claim = s.openClaim({
          standing: "proprietor",
          target: { kind: "place", id: s.ids.place() },
        });
        await insertClaims(h, claim);
        const found = await getClaim(h, claim.id);
        expect(found.entity).toEqual(claim);
        expect(found.entity.status).toBe("open");
        expect("outcome" in found.entity).toBe(false);
        expect(typeof found.expectedVersion).toBe("number");
      });

      it("takedownClaimRepository#2 申立てが保存されていない / 写真の権利者が読みものを対象にし、写真を2枚示した未対応の申立てを insert し、findById で読む", async () => {
        const h = await makeHarness();
        const s = moderationSamples();
        const target = { kind: "article", id: s.ids.article() } as const;
        const photos = [s.ids.photo(), s.ids.photo()];
        const claim = s.openClaim({
          standing: "photoRightsHolder",
          target,
          photoIds: photos,
        });
        await insertClaims(h, claim);
        expect((await getClaim(h, claim.id)).entity.ground).toEqual({
          standing: "photoRightsHolder",
          target,
          photoIds: photos,
        });
      });

      it("takedownClaimRepository#3 申立てが保存されていない / 対象が掲載・店舗・地域・イベント・読みものの申立てを1件ずつ insert し、それぞれ findById で読む", async () => {
        const h = await makeHarness();
        const s = moderationSamples();
        const targets: readonly ContentRef[] = [
          { kind: "listing", id: s.ids.listing() },
          { kind: "place", id: s.ids.place() },
          { kind: "region", id: s.ids.region() },
          { kind: "occasion", id: s.ids.occasion() },
          { kind: "article", id: s.ids.article() },
        ];
        const claims = targets.map((target) =>
          s.openClaim({ target, photoIds: [s.ids.photo()] }),
        );
        await insertClaims(h, ...claims);
        for (const [i, claim] of claims.entries()) {
          expect((await getClaim(h, claim.id)).entity.ground.target).toEqual(
            targets[i],
          );
        }
      });

      it("takedownClaimRepository#4 申立てが保存されていない / findById を呼ぶ", async () => {
        const h = await makeHarness();
        expect(await findClaim(h, moderationSamples().ids.claim())).toBeNull();
      });

      it("takedownClaimRepository#5 ID が同じ申立てが保存されている / 同じ ID の申立てを insert する", async () => {
        const h = await makeHarness();
        const s = moderationSamples();
        const claim = s.openClaim();
        await insertClaims(h, claim);
        const other = s.openClaim({ id: claim.id, reason: "別の理由" });
        await expect(insertClaims(h, other)).rejects.toBeInstanceOf(
          ConflictError,
        );
        expect((await getClaim(h, claim.id)).entity).toEqual(claim);
      });

      it("takedownClaimRepository#6 申立てが保存されている / 別の ID で、立場・対象・写真・理由・メールアドレスが同じ申立てを insert する", async () => {
        const h = await makeHarness();
        const s = moderationSamples();
        const first = s.openClaim();
        const second = s.openClaim({
          target: first.ground.target,
          at: first.receivedAt,
        });
        await insertClaims(h, first);
        await insertClaims(h, second);
        expect((await getClaim(h, first.id)).entity).toEqual(first);
        expect((await getClaim(h, second.id)).entity).toEqual(second);
      });

      it("takedownClaimRepository#7 申立てが保存されていない / どの集約も指さない ID を対象にした申立てを insert する", async () => {
        const h = await makeHarness();
        const s = moderationSamples();
        const claim = s.openClaim({
          target: { kind: "listing", id: s.ids.listing() },
        });
        await insertClaims(h, claim);
        expect((await getClaim(h, claim.id)).entity).toEqual(claim);
      });

      it("takedownClaimRepository#8 未対応の申立てが保存されている / findById の expectedVersion で、resolve した申立てを save し、findById で読む", async () => {
        const h = await makeHarness();
        const s = moderationSamples();
        const claim = s.openClaim({ photoIds: [s.ids.photo()] });
        await insertClaims(h, claim);
        const read = await getClaim(h, claim.id);
        const resolved = s.resolvedClaim(claim, "写真を削除しました");
        await saveClaim(h, resolved, read.expectedVersion);
        const after = await getClaim(h, claim.id);
        expect(after.entity).toEqual(resolved);
        expect(after.entity).toMatchObject({
          status: "resolved",
          outcome: "写真を削除しました",
          ground: claim.ground,
          reason: claim.reason,
          email: claim.email,
          receivedAt: claim.receivedAt,
        });
        expect(after.entity.version).toBe(claim.version + 1);
      });

      it("takedownClaimRepository#9 未対応の申立てが保存されている。findById の後に、別の save がコミットされた / 古い expectedVersion で save する", async () => {
        const h = await makeHarness();
        const s = moderationSamples();
        const claim = s.openClaim();
        await insertClaims(h, claim);
        const read = await getClaim(h, claim.id);
        const first = s.resolvedClaim(claim, "先の結果");
        await saveClaim(h, first, read.expectedVersion);
        await expect(
          saveClaim(
            h,
            s.resolvedClaim(claim, "後の結果"),
            read.expectedVersion,
          ),
        ).rejects.toBeInstanceOf(ConflictError);
        expect((await getClaim(h, claim.id)).entity).toEqual(first);
      });

      it("takedownClaimRepository#10 申立てが保存されていない / その ID の申立てを save する", async () => {
        const h = await makeHarness();
        const s = moderationSamples();
        const [other, claim] = [s.openClaim(), s.openClaim()];
        await insertClaims(h, other);
        const token = (await getClaim(h, other.id)).expectedVersion;
        await expect(
          saveClaim(h, s.resolvedClaim(claim), token),
        ).rejects.toBeInstanceOf(NotFoundError);
        expect(await findClaim(h, claim.id)).toBeNull();
      });
    });

    describe("findOpen", () => {
      it("takedownClaimRepository#11 申立てが保存されていない / page: 1、limit: 10 で findOpen を呼ぶ", async () => {
        const h = await makeHarness();
        expect(await findOpenClaims(h, page(1, 10))).toEqual({
          items: [],
          count: 0,
        });
      });

      it("takedownClaimRepository#12 未対応の申立てが1件保存されている / page: 1、limit: 10 で findOpen を呼ぶ", async () => {
        const h = await makeHarness();
        const claim = moderationSamples().openClaim();
        await insertClaims(h, claim);
        expect(await findOpenClaims(h, page(1, 10))).toEqual({
          items: [claim],
          count: 1,
        });
      });

      it("takedownClaimRepository#13 未対応の申立てが2件、対応済みの申立てが1件保存されている / findOpen を呼ぶ", async () => {
        const h = await makeHarness();
        const s = moderationSamples();
        const [a, b] = [s.openClaim(), s.openClaim()];
        await insertClaims(h, a, s.resolvedClaim(s.openClaim()), b);
        const found = await findOpenClaims(h);
        expect(idsOf(found.items)).toEqual([a.id, b.id]);
        expect(found.count).toBe(2);
      });

      it("takedownClaimRepository#14 receivedAt が互いに違う未対応の申立てが3件、receivedAt の順と違う順で insert されている / findOpen を呼ぶ", async () => {
        const h = await makeHarness();
        const s = moderationSamples();
        const late = s.openClaim({ at: at(30) });
        const early = s.openClaim({ at: at(10) });
        const middle = s.openClaim({ at: at(20) });
        await insertClaims(h, late, early, middle);
        expect(idsOf((await findOpenClaims(h)).items)).toEqual([
          early.id,
          middle.id,
          late.id,
        ]);
      });

      it("takedownClaimRepository#15 receivedAt が同じで ID の違う未対応の申立てが2件保存されている / findOpen を呼ぶ", async () => {
        const h = await makeHarness();
        const s = moderationSamples();
        const [lower, higher] = [s.ids.claim(), s.ids.claim()];
        await insertClaims(
          h,
          s.openClaim({ id: higher, at: at(5) }),
          s.openClaim({ id: lower, at: at(5) }),
        );
        expect(idsOf((await findOpenClaims(h)).items)).toEqual([lower, higher]);
      });

      it("takedownClaimRepository#16 未対応の申立てが3件保存されている / page: 1、limit: 3 で findOpen を呼ぶ", async () => {
        const h = await makeHarness();
        const s = moderationSamples();
        await insertClaims(h, s.openClaim(), s.openClaim(), s.openClaim());
        const found = await findOpenClaims(h, page(1, 3));
        expect(found.items).toHaveLength(3);
        expect(found.count).toBe(3);
      });

      it("takedownClaimRepository#17 未対応の申立てが5件保存されている / limit: 3 で、page: 1 と page: 2 を呼ぶ", async () => {
        const h = await makeHarness();
        const s = moderationSamples();
        const claims = Array.from({ length: 5 }, () => s.openClaim());
        await insertClaims(h, ...claims);
        const first = await findOpenClaims(h, page(1, 3));
        const second = await findOpenClaims(h, page(2, 3));
        expect(idsOf(first.items)).toEqual(idsOf(claims.slice(0, 3)));
        expect(idsOf(second.items)).toEqual(idsOf(claims.slice(3)));
        expect([first.count, second.count]).toEqual([5, 5]);
      });

      it("takedownClaimRepository#18 未対応の申立てが5件保存されている / page: 3、limit: 3 で findOpen を呼ぶ", async () => {
        const h = await makeHarness();
        const s = moderationSamples();
        await insertClaims(
          h,
          ...Array.from({ length: 5 }, () => s.openClaim()),
        );
        expect(await findOpenClaims(h, page(3, 3))).toEqual({
          items: [],
          count: 5,
        });
      });

      it("takedownClaimRepository#19 未対応の申立てが100件保存されている / page: 1、limit: 100 で findOpen を呼ぶ", async () => {
        const h = await makeHarness();
        const s = moderationSamples();
        const claims = Array.from({ length: 100 }, () => s.openClaim());
        await insertClaims(h, ...claims);
        const found = await findOpenClaims(h, page(1, 100));
        expect(idsOf(found.items)).toEqual(idsOf(claims));
        expect(found.count).toBe(100);
      });

      it("takedownClaimRepository#20 未対応の申立てが5件、対応済みの申立てが2件保存されている / page: 1、limit: 3 で findOpen を呼ぶ", async () => {
        const h = await makeHarness();
        const s = moderationSamples();
        await insertClaims(
          h,
          ...Array.from({ length: 5 }, () => s.openClaim()),
          s.resolvedClaim(s.openClaim()),
          s.resolvedClaim(s.openClaim()),
        );
        const found = await findOpenClaims(h, page(1, 3));
        expect(found.items).toHaveLength(3);
        expect(found.count).toBe(5);
      });
    });

    describe("並行性", () => {
      it("takedownClaimRepository#21 未対応の申立てが保存されている / 2つの UnitOfWork が、同じ expectedVersion で、違う結果で resolve した申立てを同時に save する", async () => {
        const h = await makeHarness();
        const s = moderationSamples();
        const claim = s.openClaim();
        await insertClaims(h, claim);
        const bothRead = barrier(2);
        const attempt = (outcome: string) =>
          h.uow.run(async ({ takedownClaimRepository }) => {
            const read = await takedownClaimRepository.findById(claim.id);
            if (read === null) throw new Error("no claim");
            await bothRead();
            await takedownClaimRepository.save(
              s.resolvedClaim(claim, outcome),
              read.expectedVersion,
            );
          });
        const results = await Promise.allSettled([
          attempt("結果A"),
          attempt("結果B"),
        ]);
        const won = results.findIndex((r) => r.status === "fulfilled");
        const lost = results.find((r) => r.status === "rejected");
        expect(won).not.toBe(-1);
        expect(lost?.reason).toBeInstanceOf(ConflictError);
        const stored = (await getClaim(h, claim.id)).entity;
        expect(stored.status === "resolved" && stored.outcome).toBe(
          won === 0 ? "結果A" : "結果B",
        );
      });

      it("takedownClaimRepository#22 申立てが保存されていない / 2つの UnitOfWork が、同じ ID の申立てを同時に insert する", async () => {
        const h = await makeHarness();
        const s = moderationSamples();
        const id = s.ids.claim();
        const [a, b] = [
          s.openClaim({ id, reason: "理由A" }),
          s.openClaim({ id, reason: "理由B" }),
        ];
        const bothRead = barrier(2);
        const attempt = (claim: typeof a) =>
          h.uow.run(async ({ takedownClaimRepository }) => {
            await takedownClaimRepository.findById(id);
            await bothRead();
            await takedownClaimRepository.insert(claim);
          });
        const results = await Promise.allSettled([attempt(a), attempt(b)]);
        const won = results.findIndex((r) => r.status === "fulfilled");
        expect(won).not.toBe(-1);
        expect(
          results.find((r) => r.status === "rejected")?.reason,
        ).toBeInstanceOf(ConflictError);
        expect((await getClaim(h, id)).entity).toEqual(won === 0 ? a : b);
        expect((await findOpenClaims(h)).count).toBe(1);
      });
    });

    describe("可視性と UnitOfWork", () => {
      it("takedownClaimRepository#23 申立てが保存されていない / UnitOfWork の中で未対応の申立てを insert してコミットし、直後に findById と findOpen を呼ぶ", async () => {
        const h = await makeHarness();
        const claim = moderationSamples().openClaim();
        await insertClaims(h, claim);
        expect((await getClaim(h, claim.id)).entity).toEqual(claim);
        expect((await findOpenClaims(h)).items).toEqual([claim]);
      });

      it("takedownClaimRepository#24 未対応の申立てが保存されている / UnitOfWork の中で、resolve した申立てを save してコミットし、直後に findById と findOpen を呼ぶ", async () => {
        const h = await makeHarness();
        const s = moderationSamples();
        const [claim, other] = [s.openClaim(), s.openClaim()];
        await insertClaims(h, claim, other);
        const read = await getClaim(h, claim.id);
        await saveClaim(h, s.resolvedClaim(claim), read.expectedVersion);
        expect((await getClaim(h, claim.id)).entity.status).toBe("resolved");
        const open = await findOpenClaims(h);
        expect(idsOf(open.items)).toEqual([other.id]);
        expect(open.count).toBe(1);
      });

      it("takedownClaimRepository#25 申立てが保存されていない / UnitOfWork の中で insert した後に、fn が例外を投げる", async () => {
        const h = await makeHarness();
        const claim = moderationSamples().openClaim();
        const abort = new ScopeAbort();
        await expect(
          h.uow.run(async ({ takedownClaimRepository }) => {
            await takedownClaimRepository.insert(claim);
            throw abort;
          }),
        ).rejects.toBe(abort);
        expect(await findClaim(h, claim.id)).toBeNull();
        expect((await findOpenClaims(h)).count).toBe(0);
      });

      it("takedownClaimRepository#26 未対応の申立てが保存されている / UnitOfWork の中で、resolve した申立てを save した後に、fn が例外を投げる", async () => {
        const h = await makeHarness();
        const s = moderationSamples();
        const claim = s.openClaim();
        await insertClaims(h, claim);
        const read = await getClaim(h, claim.id);
        const abort = new ScopeAbort();
        await expect(
          h.uow.run(async ({ takedownClaimRepository }) => {
            await takedownClaimRepository.save(
              s.resolvedClaim(claim),
              read.expectedVersion,
            );
            throw abort;
          }),
        ).rejects.toBe(abort);
        const after = await getClaim(h, claim.id);
        expect(after.entity).toEqual(claim);
        expect(after.expectedVersion).toBe(read.expectedVersion);
        expect(idsOf((await findOpenClaims(h)).items)).toEqual([claim.id]);
      });

      it("takedownClaimRepository#27 未対応の申立て A と、申立て B が保存されている / 1つの UnitOfWork の中で、resolve した A を save し、B と同じ ID の申立てを insert する", async () => {
        const h = await makeHarness();
        const s = moderationSamples();
        const [a, b] = [s.openClaim(), s.openClaim()];
        await insertClaims(h, a, b);
        const readA = await getClaim(h, a.id);
        await expect(
          h.uow.run(async ({ takedownClaimRepository }) => {
            await takedownClaimRepository.save(
              s.resolvedClaim(a),
              readA.expectedVersion,
            );
            await takedownClaimRepository.insert(
              s.openClaim({ id: b.id, reason: "別の理由" }),
            );
          }),
        ).rejects.toBeInstanceOf(ConflictError);
        expect((await getClaim(h, a.id)).entity).toEqual(a);
        expect((await getClaim(h, b.id)).entity).toEqual(b);
      });
    });
  });
}
