import { ConflictError, NotFoundError } from "@repo/core/application/errors";
import type { OccasionId } from "@repo/core/domain/common/ids";
import type { Pagination } from "@repo/core/domain/common/pagination";
import type { SearchKeyword } from "@repo/core/domain/common/searchKeyword";
import type { ExpectedVersion } from "@repo/core/domain/common/transactionalRepository";
import { OccasionContent } from "@repo/core/domain/occasion/content";
import { Occasion } from "@repo/core/domain/occasion/occasion";
import { SampleAddress } from "@repo/core/domain/place/testing/samples";
import { describe, expect, it } from "vitest";
import { expectBusinessRuleError } from "./assertions";
import { ScopeAbort } from "./fixtures";
import type { ConformanceHarness, HarnessFactory } from "./harness";
import {
  findOccasion,
  getOccasion,
  insertOccasions,
  keyword,
  type OccasionFactory,
  occasionFactory,
  page,
  saveOccasion,
} from "./occasionFixtures";

type H = ConformanceHarness;

const byIds = (h: H, ids: readonly OccasionId[]) =>
  h.uow.run(({ occasionRepository }) => occasionRepository.findByIds(ids));

const search = (h: H, k: SearchKeyword, pagination: Pagination = page(1)) =>
  h.uow.run(({ occasionRepository }) =>
    occasionRepository.searchForOperation(k, pagination),
  );

const ids = (occasions: readonly Occasion[]): readonly OccasionId[] =>
  occasions.map((occasion) => occasion.id);

const sorted = (list: readonly OccasionId[]): readonly OccasionId[] =>
  [...list].sort();

/** The same occasion with a new name, as `updateContent` makes it. */
const renamed = (
  f: OccasionFactory,
  occasion: Occasion,
  name: string,
): Occasion =>
  Occasion.updateContent(
    occasion,
    OccasionContent.create({
      name,
      period: occasion.content.period,
      venue: occasion.content.venue,
      photoIds: occasion.content.photos.items.map((p) => p.photoId),
      description: occasion.content.description,
      tagline: occasion.content.tagline,
    }),
    f.tick(),
  ).entity;

/** One occasion in each of the six states the rows list, all named `name`. */
function sixStates(f: OccasionFactory, name: string): readonly Occasion[] {
  return [
    f.draft({ name }),
    f.published({ name }),
    f.unpublished({ name }),
    f.suspended(f.published({ name })),
    f.cancelled(f.published({ name })),
    f.published({ name, period: ["2026-01-01", "2026-01-03"] }),
  ];
}

/** `spec/testcases/ports/occasionRepository.md`. */
export function describeOccasionRepositoryContract(
  makeHarness: HarnessFactory,
): void {
  describe("OccasionRepository contract", () => {
    describe("insert・findById・save", () => {
      it("occasionRepository#1 イベントがない / draft のイベント（名称だけを持ち、開催期間・開催場所・写真・紹介・キャッチコピーがない）を insert し、findById で読む", async () => {
        const h = await makeHarness();
        const f = occasionFactory();
        const draft = f.bareDraft({ name: "名称だけ" });
        await insertOccasions(h, draft);
        const read = await getOccasion(h, draft.id);
        expect(read.entity).toEqual(draft);
        expect(read.expectedVersion).toBe(draft.version);
        expect(read.entity.content).toMatchObject({
          period: null,
          venue: { address: null, location: null },
          description: null,
          tagline: null,
        });
        expect(read.entity.content.photos.items).toEqual([]);
      });

      it("occasionRepository#2 イベントがない / published のイベント（すべての項目を持ち、写真3枚を順に持つ）を insert し、findById で読む", async () => {
        const h = await makeHarness();
        const f = occasionFactory();
        const occasion = f.published({
          photos: 3,
          description: "秋の市場です",
          tagline: "今年も開催",
        });
        await insertOccasions(h, occasion);
        const read = await getOccasion(h, occasion.id);
        expect(read.entity).toEqual(occasion);
        expect(read.entity.content.photos.items).toHaveLength(3);
      });

      it('occasionRepository#3 イベントがない / unpublished（reason: "byManager"）のイベントと、unpublished（reason: "photoTakedown"）で写真のないイベントを insert し、それぞれ findById で読む', async () => {
        const h = await makeHarness();
        const f = occasionFactory();
        const byManager = f.unpublished();
        const published = f.published();
        const [photo] = published.content.photos.items;
        if (photo === undefined) throw new Error("no photo");
        const byTakedown = Occasion.takeDownPhotos(
          published,
          [photo.photoId],
          f.tick(),
        ).entity;
        await insertOccasions(h, byManager, byTakedown);
        expect((await getOccasion(h, byManager.id)).entity.publication).toEqual(
          byManager.publication,
        );
        const read = (await getOccasion(h, byTakedown.id)).entity;
        expect(read).toEqual(byTakedown);
        expect(read.publication).toMatchObject({
          status: "unpublished",
          reason: "photoTakedown",
          firstPublishedAt: published.publication.firstPublishedAt,
        });
      });

      it("occasionRepository#4 イベントがない / 運営による非公開（suspended: true）で、中止の published のイベントを insert し、findById で読む", async () => {
        const h = await makeHarness();
        const f = occasionFactory();
        const occasion = f.cancelled(f.suspended(f.published()));
        await insertOccasions(h, occasion);
        const read = (await getOccasion(h, occasion.id)).entity;
        expect(read).toEqual(occasion);
        expect(read.publication.status).toBe("published");
        expect(read.suspension).toEqual({ suspended: true });
        expect(read.cancellation).toEqual({ cancelled: true });
      });

      it("occasionRepository#5 ID が X のイベントがある / ID が X の別の内容のイベントを insert する", async () => {
        const h = await makeHarness();
        const f = occasionFactory();
        const x = f.draft({ name: "元" });
        await insertOccasions(h, x);
        await expect(
          insertOccasions(h, f.draft({ name: "別" }, f.tick(), x.id)),
        ).rejects.toBeInstanceOf(ConflictError);
        expect((await getOccasion(h, x.id)).entity).toEqual(x);
      });

      it("occasionRepository#6 イベントがない / 存在しない ID で findById を呼ぶ", async () => {
        const h = await makeHarness();
        const f = occasionFactory();
        expect(await findOccasion(h, f.occasionId())).toBeNull();
      });

      it("occasionRepository#7 ID が X のイベントがある / findById が返した expectedVersion を使って、イベント情報を置き換えたイベントを save し、findById で読む", async () => {
        const h = await makeHarness();
        const f = occasionFactory();
        const x = f.published({ name: "前" });
        await insertOccasions(h, x);
        const read = await getOccasion(h, x.id);
        const next = renamed(f, read.entity, "後");
        await saveOccasion(h, next, read.expectedVersion);
        const after = await getOccasion(h, x.id);
        expect(after.entity).toEqual(next);
        expect(after.entity.version).toBe(read.entity.version + 1);
      });

      it("occasionRepository#8 ID が X の、写真 A・B を持つ published のイベントがある / Occasion.takeDownPhotos で A を外したイベントを save し、findById で読む", async () => {
        const h = await makeHarness();
        const f = occasionFactory();
        const [a, b] = [f.photo(), f.photo()];
        const x = f.published({ photos: [a, b] });
        await insertOccasions(h, x);
        const read = await getOccasion(h, x.id);
        const next = Occasion.takeDownPhotos(read.entity, [a], f.tick()).entity;
        await saveOccasion(h, next, read.expectedVersion);
        const photos = (await getOccasion(h, x.id)).entity.content.photos;
        expect(photos.items).toEqual([{ photoId: b }]);
        expect(photos.takenDown).toBe(true);
      });

      it("occasionRepository#9 ID が X のイベントがある。findById で expectedVersion を得た後に、別の save が成立して版が進んでいる / 古い expectedVersion で save する", async () => {
        const h = await makeHarness();
        const f = occasionFactory();
        const x = f.published({ name: "元" });
        await insertOccasions(h, x);
        const read = await getOccasion(h, x.id);
        const winner = renamed(f, read.entity, "先");
        await saveOccasion(h, winner, read.expectedVersion);
        await expect(
          saveOccasion(h, renamed(f, read.entity, "後"), read.expectedVersion),
        ).rejects.toBeInstanceOf(ConflictError);
        expect((await getOccasion(h, x.id)).entity).toEqual(winner);
      });

      it("occasionRepository#10 ID が X の中止でないイベントを、2つの要求が同じ expectedVersion で読んでいる / 一方が中止にしたイベントを、他方が別の変更をしたイベントを save する", async () => {
        const h = await makeHarness();
        const f = occasionFactory();
        const x = f.published();
        await insertOccasions(h, x);
        const first = await getOccasion(h, x.id);
        const second = await getOccasion(h, x.id);
        const cancelled = Occasion.cancel(first.entity, f.tick()).entity;
        await saveOccasion(h, cancelled, first.expectedVersion);
        await expect(
          saveOccasion(
            h,
            renamed(f, second.entity, "別の変更"),
            second.expectedVersion,
          ),
        ).rejects.toBeInstanceOf(ConflictError);
        expect((await getOccasion(h, x.id)).entity).toEqual(cancelled);
      });

      it("occasionRepository#11 イベントがない / 存在しない ID のイベントを save する", async () => {
        const h = await makeHarness();
        const f = occasionFactory();
        await expect(
          saveOccasion(h, f.draft(), 0 as ExpectedVersion<Occasion>),
        ).rejects.toBeInstanceOf(NotFoundError);
      });
    });

    describe("findByIds", () => {
      it("occasionRepository#12 draft、published、unpublished、運営による非公開、中止、開催期間を過ぎたイベントが1件ずつある / 6件の ID で findByIds を呼ぶ", async () => {
        const h = await makeHarness();
        const f = occasionFactory();
        const occasions = sixStates(f, "イベント");
        await insertOccasions(h, ...occasions);
        const found = await byIds(h, ids(occasions));
        expect(sorted(ids(found))).toEqual(sorted(ids(occasions)));
        for (const occasion of occasions) {
          expect(found.find((o) => o.id === occasion.id)).toEqual(occasion);
        }
      });

      it("occasionRepository#13 ID が X・Y のイベントがある。ID が Z のイベントはない / X・Y・Z で findByIds を呼ぶ", async () => {
        const h = await makeHarness();
        const f = occasionFactory();
        const [x, y] = [f.draft(), f.published()];
        await insertOccasions(h, x, y);
        const found = await byIds(h, [x.id, y.id, f.occasionId()]);
        expect(sorted(ids(found))).toEqual(sorted([x.id, y.id]));
      });

      it("occasionRepository#14 イベントがある / 空の ids で findByIds を呼ぶ", async () => {
        const h = await makeHarness();
        const f = occasionFactory();
        await insertOccasions(h, f.draft());
        expect(await byIds(h, [])).toEqual([]);
      });

      it("occasionRepository#15 イベントが100件ある / 100件の ID で findByIds を呼ぶ", async () => {
        const h = await makeHarness();
        const f = occasionFactory();
        const occasions = Array.from({ length: 100 }, () => f.draft());
        await insertOccasions(h, ...occasions);
        const found = await byIds(h, ids(occasions));
        expect(found).toHaveLength(100);
        expect(sorted(ids(found))).toEqual(sorted(ids(occasions)));
      });

      it("occasionRepository#16 イベントがある / 101件の ID で findByIds を呼ぶ", async () => {
        const h = await makeHarness();
        const f = occasionFactory();
        const x = f.draft();
        await insertOccasions(h, x);
        await expectBusinessRuleError(
          byIds(h, [x.id, ...Array.from({ length: 100 }, f.occasionId)]),
          "COMMON_INVALID_INPUT",
        );
      });
    });

    describe("searchForOperation", () => {
      it("a keyword whose terms NFKC expands past 100 characters is searched, not refused", async () => {
        const h = await makeHarness();
        const f = occasionFactory();
        const long = f.draft({ description: "株式会社".repeat(30) });
        await insertOccasions(h, long, f.draft());
        const result = await search(h, keyword("㍿".repeat(30)));
        expect(ids(result.items)).toEqual([long.id]);
      });

      it("occasionRepository#17 名称が「秋のマルシェ」のイベントが、draft・published・unpublished・運営による非公開・中止・開催期間を過ぎた状態で1件ずつある / 「マルシェ」で searchForOperation を呼ぶ", async () => {
        const h = await makeHarness();
        const f = occasionFactory();
        const occasions = sixStates(f, "秋のマルシェ");
        await insertOccasions(h, ...occasions);
        const result = await search(h, keyword("マルシェ"));
        expect(result.count).toBe(6);
        expect(ids(result.items)).toEqual(sorted(ids(occasions)));
      });

      it("occasionRepository#18 名称が「Autumn Market」のイベントがある / 「autumn market」と「autumnmarket」でそれぞれ searchForOperation を呼ぶ", async () => {
        const h = await makeHarness();
        const f = occasionFactory();
        const x = f.draft({ name: "Autumn Market" });
        await insertOccasions(h, x);
        for (const input of ["autumn market", "autumnmarket"]) {
          expect(ids((await search(h, keyword(input))).items)).toEqual([x.id]);
        }
      });

      it("occasionRepository#19 名称が「秋のマルシェ」「マルシェ広場」のイベントがある / 「秋 マルシェ」で searchForOperation を呼ぶ", async () => {
        const h = await makeHarness();
        const f = occasionFactory();
        const autumn = f.draft({ name: "秋のマルシェ" });
        await insertOccasions(h, autumn, f.draft({ name: "マルシェ広場" }));
        expect(ids((await search(h, keyword("秋 マルシェ"))).items)).toEqual([
          autumn.id,
        ]);
      });

      it("occasionRepository#20 名称が「ＡＢＣ　フェス」（全角の英字と全角の空白）のイベントがある / 「abcフェス」で searchForOperation を呼ぶ", async () => {
        const h = await makeHarness();
        const f = occasionFactory();
        const x = f.draft({ name: "ＡＢＣ　フェス" });
        await insertOccasions(h, x);
        expect(ids((await search(h, keyword("abcフェス"))).items)).toEqual([
          x.id,
        ]);
      });

      it("occasionRepository#21 名称が「秋のマルシェ」「マルシェ広場」「マルシェ」のイベントがある / 「マルシェ」で searchForOperation を呼ぶ", async () => {
        const h = await makeHarness();
        const f = occasionFactory();
        const partial = f.draft({ name: "秋のマルシェ" });
        const prefix = f.draft({ name: "マルシェ広場" });
        const exact = f.draft({ name: "マルシェ" });
        await insertOccasions(h, partial, prefix, exact);
        expect(ids((await search(h, keyword("マルシェ"))).items)).toEqual([
          exact.id,
          prefix.id,
          partial.id,
        ]);
      });

      it("occasionRepository#22 名称が「マルシェ」のイベントが2件ある（ID は A < B） / 「マルシェ」で searchForOperation を呼ぶ", async () => {
        const h = await makeHarness();
        const f = occasionFactory();
        const a = f.draft({ name: "マルシェ" });
        const b = f.draft({ name: "マルシェ" });
        await insertOccasions(h, b, a);
        expect(ids((await search(h, keyword("マルシェ"))).items)).toEqual([
          a.id,
          b.id,
        ]);
      });

      it("occasionRepository#23 名称が「マルシェ」のイベントと、名称に「マルシェ」を含まず、キャッチコピー・紹介・開催場所の所在地のそれぞれにだけ「マルシェ」を含むイベントが3件ある / 「マルシェ」で searchForOperation を呼ぶ", async () => {
        const h = await makeHarness();
        const f = occasionFactory();
        const byTagline = f.draft({ name: "秋祭り", tagline: "マルシェも" });
        const byDescription = f.draft({
          name: "夏祭り",
          description: "マルシェがあります",
        });
        const byAddress = f.draft({
          name: "冬祭り",
          address: SampleAddress.otemachi("マルシェ通り1-1"),
        });
        const named = f.draft({ name: "マルシェ" });
        await insertOccasions(h, byTagline, byDescription, byAddress, named);
        const result = await search(h, keyword("マルシェ"));
        expect(ids(result.items)).toEqual([
          named.id,
          ...sorted([byTagline.id, byDescription.id, byAddress.id]),
        ]);
        expect(result.count).toBe(4);
      });

      it("occasionRepository#24 名称のない draft のイベントで、紹介に「祭」を含むものと含まないものがある / 「祭」で searchForOperation を呼ぶ", async () => {
        const h = await makeHarness();
        const f = occasionFactory();
        const hit = f.bareDraft({ description: "夏祭りの準備" });
        await insertOccasions(
          h,
          hit,
          f.bareDraft({ description: "市場の準備" }),
        );
        expect(ids((await search(h, keyword("祭"))).items)).toEqual([hit.id]);
      });

      it("occasionRepository#25 名称に「マルシェ」を含むイベントがない / 「マルシェ」、page: 1 で searchForOperation を呼ぶ", async () => {
        const h = await makeHarness();
        const f = occasionFactory();
        await insertOccasions(h, f.draft({ name: "春祭り" }));
        expect(await search(h, keyword("マルシェ"), page(1))).toEqual({
          items: [],
          count: 0,
        });
      });

      it("occasionRepository#26 名称に「マルシェ」を含むイベントが1件ある / 「マルシェ」、page: 1、limit: 10 で searchForOperation を呼ぶ", async () => {
        const h = await makeHarness();
        const f = occasionFactory();
        const x = f.draft({ name: "秋のマルシェ" });
        await insertOccasions(h, x);
        const result = await search(h, keyword("マルシェ"), page(1, 10));
        expect(ids(result.items)).toEqual([x.id]);
        expect(result.count).toBe(1);
      });

      it("occasionRepository#27 名称に「マルシェ」を含むイベントが10件ある / page: 1、limit: 10 で searchForOperation を呼ぶ", async () => {
        const h = await makeHarness();
        const f = occasionFactory();
        const occasions = Array.from({ length: 10 }, () =>
          f.draft({ name: "マルシェ" }),
        );
        await insertOccasions(h, ...occasions);
        const first = await search(h, keyword("マルシェ"), page(1, 10));
        const second = await search(h, keyword("マルシェ"), page(2, 10));
        expect(first.items).toHaveLength(10);
        expect(first.count).toBe(10);
        expect(second).toEqual({ items: [], count: 10 });
      });

      it("occasionRepository#28 名称に「マルシェ」を含むイベントが11件ある / page: 1、limit: 10 と、page: 2、limit: 10 で searchForOperation を呼ぶ", async () => {
        const h = await makeHarness();
        const f = occasionFactory();
        const occasions = Array.from({ length: 11 }, () =>
          f.draft({ name: "マルシェ" }),
        );
        await insertOccasions(h, ...occasions);
        const first = await search(h, keyword("マルシェ"), page(1, 10));
        const second = await search(h, keyword("マルシェ"), page(2, 10));
        const ordered = sorted(ids(occasions));
        expect(ids(first.items)).toEqual(ordered.slice(0, 10));
        expect(ids(second.items)).toEqual(ordered.slice(10));
        expect([first.count, second.count]).toEqual([11, 11]);
      });

      it("occasionRepository#29 名称に「マルシェ」を含むイベントが11件ある / page: 3、limit: 10 で searchForOperation を呼ぶ", async () => {
        const h = await makeHarness();
        const f = occasionFactory();
        await insertOccasions(
          h,
          ...Array.from({ length: 11 }, () => f.draft({ name: "マルシェ" })),
        );
        expect(await search(h, keyword("マルシェ"), page(3, 10))).toEqual({
          items: [],
          count: 11,
        });
      });
    });

    describe("可視性と UnitOfWork", () => {
      it("occasionRepository#30 イベントがない / UnitOfWork の中で「冬のマルシェ」を insert してコミットし、直後に findById・findByIds・searchForOperation を呼ぶ", async () => {
        const h = await makeHarness();
        const f = occasionFactory();
        const x = f.draft({ name: "冬のマルシェ" });
        await h.uow.run(({ occasionRepository }) =>
          occasionRepository.insert(x),
        );
        expect((await getOccasion(h, x.id)).entity).toEqual(x);
        expect(ids(await byIds(h, [x.id]))).toEqual([x.id]);
        expect(ids((await search(h, keyword("冬のマルシェ"))).items)).toEqual([
          x.id,
        ]);
      });

      it("occasionRepository#31 名称が「冬のマルシェ」のイベントがある / UnitOfWork の中で名称を「春のマルシェ」に置き換えて save してコミットし、直後に「冬」と「春」で searchForOperation を呼ぶ", async () => {
        const h = await makeHarness();
        const f = occasionFactory();
        const x = f.draft({ name: "冬のマルシェ" });
        await insertOccasions(h, x);
        await h.uow.run(async ({ occasionRepository }) => {
          const read = await occasionRepository.findById(x.id);
          if (read === null) throw new Error("no occasion");
          await occasionRepository.save(
            renamed(f, read.entity, "春のマルシェ"),
            read.expectedVersion,
          );
        });
        expect((await search(h, keyword("冬"))).items).toEqual([]);
        expect(ids((await search(h, keyword("春"))).items)).toEqual([x.id]);
      });

      it("occasionRepository#32 イベントがない / UnitOfWork の中でイベントを insert した後、fn が例外を投げる", async () => {
        const h = await makeHarness();
        const f = occasionFactory();
        const x = f.draft({ name: "冬のマルシェ" });
        const abort = new ScopeAbort();
        await expect(
          h.uow.run(async ({ occasionRepository }) => {
            await occasionRepository.insert(x);
            throw abort;
          }),
        ).rejects.toBe(abort);
        expect(await findOccasion(h, x.id)).toBeNull();
        expect((await search(h, keyword("冬のマルシェ"))).items).toEqual([]);
      });

      it("occasionRepository#33 ID が X のイベントがある / UnitOfWork の中で X を save した後、fn が例外を投げる", async () => {
        const h = await makeHarness();
        const f = occasionFactory();
        const x = f.draft({ name: "前" });
        await insertOccasions(h, x);
        const read = await getOccasion(h, x.id);
        const abort = new ScopeAbort();
        await expect(
          h.uow.run(async ({ occasionRepository }) => {
            await occasionRepository.save(
              renamed(f, read.entity, "後"),
              read.expectedVersion,
            );
            throw abort;
          }),
        ).rejects.toBe(abort);
        const after = await getOccasion(h, x.id);
        expect(after.entity).toEqual(x);
        expect(after.expectedVersion).toBe(read.expectedVersion);
      });

      it("occasionRepository#34 ID が X のイベントがある / 1つの UnitOfWork の中で、X の save と、新しいイベント Y の insert を行い、Y の insert が ID の重複で ConflictError になる", async () => {
        const h = await makeHarness();
        const f = occasionFactory();
        const x = f.draft({ name: "前" });
        const taken = f.draft();
        await insertOccasions(h, x, taken);
        const read = await getOccasion(h, x.id);
        await expect(
          h.uow.run(async ({ occasionRepository }) => {
            await occasionRepository.save(
              renamed(f, read.entity, "後"),
              read.expectedVersion,
            );
            await occasionRepository.insert(
              f.draft({ name: "Y" }, f.tick(), taken.id),
            );
          }),
        ).rejects.toBeInstanceOf(ConflictError);
        expect((await getOccasion(h, x.id)).entity).toEqual(x);
      });
    });
  });
}
