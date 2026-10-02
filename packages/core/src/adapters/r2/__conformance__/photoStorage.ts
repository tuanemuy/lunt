import { expectBusinessRuleError } from "@repo/core/adapters/durableObject/__conformance__/assertions";
import { ScopeAbort } from "@repo/core/adapters/durableObject/__conformance__/fixtures";
import { FakeIdGenerator } from "@repo/core/application/__tests__/fakes/fakeIdGenerator";
import { NotFoundError } from "@repo/core/application/errors";
import type { UnitOfWorkProvider } from "@repo/core/application/execution/unitOfWork";
import { CommonErrorCode } from "@repo/core/domain/common/errorCode";
import { PhotoId } from "@repo/core/domain/common/ids";
import type { PhotoDisplayRef } from "@repo/core/domain/media/photoDisplayRef";
import type { PhotoFile } from "@repo/core/domain/media/photoFile";
import { PhotoIntake } from "@repo/core/domain/media/photoIntake";
import type { PhotoStorage } from "@repo/core/domain/media/ports/photoStorage";
import { describe, expect, it } from "vitest";
import { inspectPhoto } from "../../shared/structuralPhotoInspector";
import { samplePng } from "../../shared/testing/photoSamples";

/** What the served content of a display ref is: its bytes and type. */
export type FetchedPhoto = Readonly<{
  bytes: Uint8Array;
  contentType: string | null;
}>;

/**
 * What the `PhotoStorage` suite needs from a backend: the storage, a way to
 * follow a display ref the way a browser would (`null` when nothing is
 * served), and a unit of work to show storage writes are not part of one.
 */
export type PhotoStorageHarness = Readonly<{
  storage: PhotoStorage;
  fetch(ref: PhotoDisplayRef): Promise<FetchedPhoto | null>;
  uow: UnitOfWorkProvider;
}>;

export type PhotoStorageHarnessFactory = () => Promise<PhotoStorageHarness>;

/** Follows `ref` through a handler that serves photo requests. */
export async function fetchThrough(
  serve: (request: Request) => Promise<Response>,
  ref: PhotoDisplayRef,
): Promise<FetchedPhoto | null> {
  const response = await serve(
    new Request(new URL(ref.url, "http://lunt.test")),
  );
  if (response.status === 404) return null;
  if (response.status !== 200) {
    throw new Error(`Unexpected status ${response.status} for ${ref.url}`);
  }
  return {
    bytes: new Uint8Array(await response.arrayBuffer()),
    contentType: response.headers.get("Content-Type"),
  };
}

const fileOf = (seed: number): PhotoFile => {
  const bytes = samplePng(seed);
  return PhotoIntake.accept(bytes, inspectPhoto(bytes));
};

// A backend's bucket may outlive one test (the Workers pool isolates storage
// per file), so ids and files are unique across the whole suite.
const ids = new FakeIdGenerator();
let seed = 0;

function kit(h: PhotoStorageHarness) {
  return {
    id: () => PhotoId.create(ids.next()),
    file: () => fileOf(++seed),
    async refOf(id: PhotoId): Promise<PhotoDisplayRef> {
      const ref = (await h.storage.displayRefs([id])).get(id);
      if (ref === undefined) throw new Error(`no ref for ${id}`);
      return ref;
    },
    /** What `id`'s ref serves now. */
    async served(id: PhotoId): Promise<FetchedPhoto | null> {
      return h.fetch(await this.refOf(id));
    },
  };
}

const expectServes = (fetched: FetchedPhoto | null, file: PhotoFile) => {
  expect(fetched).not.toBeNull();
  expect(fetched?.bytes).toEqual(file.bytes);
  expect(fetched?.contentType).toBe(file.format);
};

/**
 * The `PhotoStorage` contract (`spec/testcases/ports/photoStorage.md`),
 * run against every backend. 「取得できる」 is following the ref from
 * `displayRefs` and receiving the photo.
 */
export function describePhotoStorageContract(
  makeHarness: PhotoStorageHarnessFactory,
): void {
  describe("PhotoStorage contract", () => {
    describe("put", () => {
      it("photoStorage#1 実体がない / PhotoId とファイルで put する", async () => {
        const h = await makeHarness();
        const k = kit(h);
        const id = k.id();
        const file = k.file();
        await h.storage.put(id, file);
        expectServes(await k.served(id), file);
      });

      it("photoStorage#2 put した PhotoId / 同じ PhotoId と同じファイルで、もう一度 put する", async () => {
        const h = await makeHarness();
        const k = kit(h);
        const id = k.id();
        const file = k.file();
        await h.storage.put(id, file);
        await h.storage.put(id, file);
        expectServes(await k.served(id), file);
      });

      it("photoStorage#3 put した PhotoId / 同じ PhotoId と別のファイルで put する", async () => {
        const h = await makeHarness();
        const k = kit(h);
        const id = k.id();
        await h.storage.put(id, k.file());
        const replacement = k.file();
        await h.storage.put(id, replacement);
        expectServes(await k.served(id), replacement);
      });

      it("photoStorage#4 実体がない / 2つの PhotoId に、それぞれ別のファイルを put する", async () => {
        const h = await makeHarness();
        const k = kit(h);
        const [a, b] = [k.id(), k.id()];
        const [fa, fb] = [k.file(), k.file()];
        await h.storage.put(a, fa);
        await h.storage.put(b, fb);
        expectServes(await k.served(a), fa);
        expectServes(await k.served(b), fb);
      });
    });

    describe("copy", () => {
      it("photoStorage#5 put した元の PhotoId / 元から新しい PhotoId へ copy する", async () => {
        const h = await makeHarness();
        const k = kit(h);
        const [source, copy] = [k.id(), k.id()];
        const file = k.file();
        await h.storage.put(source, file);
        await h.storage.copy(source, copy);
        expectServes(await k.served(copy), file);
        expectServes(await k.served(source), file);
      });

      it("photoStorage#6 copy した元と複製 / 元を delete する", async () => {
        const h = await makeHarness();
        const k = kit(h);
        const [source, copy] = [k.id(), k.id()];
        const file = k.file();
        await h.storage.put(source, file);
        await h.storage.copy(source, copy);
        await h.storage.delete(source);
        expectServes(await k.served(copy), file);
      });

      it("photoStorage#7 copy した元と複製 / 複製を delete する", async () => {
        const h = await makeHarness();
        const k = kit(h);
        const [source, copy] = [k.id(), k.id()];
        const file = k.file();
        await h.storage.put(source, file);
        await h.storage.copy(source, copy);
        await h.storage.delete(copy);
        expectServes(await k.served(source), file);
      });

      it("photoStorage#8 copy した元と複製 / 元に別のファイルを put する", async () => {
        const h = await makeHarness();
        const k = kit(h);
        const [source, copy] = [k.id(), k.id()];
        const file = k.file();
        await h.storage.put(source, file);
        await h.storage.copy(source, copy);
        await h.storage.put(source, k.file());
        expectServes(await k.served(copy), file);
      });

      it("photoStorage#9 元と、すでに実体のある複製先 / 元から複製先へ copy する", async () => {
        const h = await makeHarness();
        const k = kit(h);
        const [source, destination] = [k.id(), k.id()];
        const file = k.file();
        await h.storage.put(source, file);
        await h.storage.put(destination, k.file());
        await h.storage.copy(source, destination);
        expectServes(await k.served(destination), file);
      });

      it("photoStorage#10 copy した元と複製 / 同じ引数で、もう一度 copy する", async () => {
        const h = await makeHarness();
        const k = kit(h);
        const [source, copy] = [k.id(), k.id()];
        const file = k.file();
        await h.storage.put(source, file);
        await h.storage.copy(source, copy);
        await h.storage.copy(source, copy);
        expectServes(await k.served(copy), file);
        expectServes(await k.served(source), file);
      });

      it("photoStorage#11 copy で作った複製 / 複製を元にして、さらに別の PhotoId へ copy する", async () => {
        const h = await makeHarness();
        const k = kit(h);
        const [source, copy, second] = [k.id(), k.id(), k.id()];
        const file = k.file();
        await h.storage.put(source, file);
        await h.storage.copy(source, copy);
        await h.storage.copy(copy, second);
        expectServes(await k.served(second), file);
      });

      it("photoStorage#12 元の PhotoId に実体がない / copy する", async () => {
        const h = await makeHarness();
        const k = kit(h);
        const [source, copy] = [k.id(), k.id()];
        await expect(h.storage.copy(source, copy)).rejects.toBeInstanceOf(
          NotFoundError,
        );
        expect(await k.served(copy)).toBeNull();
      });

      it("photoStorage#13 元の実体を delete した / その PhotoId を元に copy する", async () => {
        const h = await makeHarness();
        const k = kit(h);
        const [source, copy] = [k.id(), k.id()];
        await h.storage.put(source, k.file());
        await h.storage.delete(source);
        await expect(h.storage.copy(source, copy)).rejects.toBeInstanceOf(
          NotFoundError,
        );
      });
    });

    describe("delete", () => {
      it("photoStorage#14 put した PhotoId / delete する", async () => {
        const h = await makeHarness();
        const k = kit(h);
        const id = k.id();
        await h.storage.put(id, k.file());
        await h.storage.delete(id);
        expect(await k.served(id)).toBeNull();
      });

      it("photoStorage#15 delete した PhotoId / もう一度 delete する", async () => {
        const h = await makeHarness();
        const k = kit(h);
        const id = k.id();
        await h.storage.put(id, k.file());
        await h.storage.delete(id);
        await expect(h.storage.delete(id)).resolves.toBeUndefined();
      });

      it("photoStorage#16 一度も実体を置いていない PhotoId / delete する", async () => {
        const h = await makeHarness();
        const k = kit(h);
        await expect(h.storage.delete(k.id())).resolves.toBeUndefined();
      });

      it("photoStorage#17 2つの PhotoId に put した / 片方を delete する", async () => {
        const h = await makeHarness();
        const k = kit(h);
        const [a, b] = [k.id(), k.id()];
        const fb = k.file();
        await h.storage.put(a, k.file());
        await h.storage.put(b, fb);
        await h.storage.delete(a);
        expectServes(await k.served(b), fb);
      });

      it("photoStorage#18 delete した PhotoId / 同じ PhotoId に put する", async () => {
        const h = await makeHarness();
        const k = kit(h);
        const id = k.id();
        await h.storage.put(id, k.file());
        await h.storage.delete(id);
        const file = k.file();
        await h.storage.put(id, file);
        expectServes(await k.served(id), file);
      });
    });

    describe("displayRefs", () => {
      it("photoStorage#19 put した PhotoId が3つ / 3つを渡す", async () => {
        const h = await makeHarness();
        const k = kit(h);
        const entries = [k.id(), k.id(), k.id()].map(
          (id) => [id, k.file()] as const,
        );
        for (const [id, file] of entries) await h.storage.put(id, file);
        const refs = await h.storage.displayRefs(entries.map(([id]) => id));
        expect([...refs.keys()].sort()).toEqual(
          entries.map(([id]) => id).sort(),
        );
        for (const [id, file] of entries) {
          const ref = refs.get(id);
          if (ref === undefined) throw new Error("missing ref");
          expectServes(await h.fetch(ref), file);
        }
      });

      it("photoStorage#20 put した PhotoId と、実体のない PhotoId / 2つを渡す", async () => {
        const h = await makeHarness();
        const k = kit(h);
        const [present, absent] = [k.id(), k.id()];
        const file = k.file();
        await h.storage.put(present, file);
        const refs = await h.storage.displayRefs([present, absent]);
        expect(refs.size).toBe(2);
        const [presentRef, absentRef] = [refs.get(present), refs.get(absent)];
        if (presentRef === undefined || absentRef === undefined) {
          throw new Error("missing ref");
        }
        expectServes(await h.fetch(presentRef), file);
        expect(await h.fetch(absentRef)).toBeNull();
      });

      it("photoStorage#21 なし / 空の一覧を渡す", async () => {
        const h = await makeHarness();
        expect((await h.storage.displayRefs([])).size).toBe(0);
      });

      it("photoStorage#22 put した PhotoId / 1つを渡す", async () => {
        const h = await makeHarness();
        const k = kit(h);
        const id = k.id();
        const file = k.file();
        await h.storage.put(id, file);
        const refs = await h.storage.displayRefs([id]);
        expect([...refs.keys()]).toEqual([id]);
        expectServes(await k.served(id), file);
      });

      it("photoStorage#23 100個の PhotoId / 100個を渡す", async () => {
        const h = await makeHarness();
        const k = kit(h);
        const ids = Array.from({ length: 100 }, () => k.id());
        const refs = await h.storage.displayRefs(ids);
        expect(refs.size).toBe(100);
        for (const id of ids) expect(refs.has(id)).toBe(true);
      });

      it("photoStorage#24 101個の PhotoId / 101個を渡す", async () => {
        const h = await makeHarness();
        const k = kit(h);
        await expectBusinessRuleError(
          h.storage.displayRefs(Array.from({ length: 101 }, () => k.id())),
          CommonErrorCode.InvalidInput,
        );
      });

      it("photoStorage#25 put した PhotoId / displayRefs を2回呼ぶ", async () => {
        const h = await makeHarness();
        const k = kit(h);
        const id = k.id();
        const file = k.file();
        await h.storage.put(id, file);
        const first = await k.refOf(id);
        const second = await k.refOf(id);
        expectServes(await h.fetch(first), file);
        expectServes(await h.fetch(second), file);
      });

      it("photoStorage#26 put した PhotoId の参照を得た後、同じ PhotoId に別のファイルを put した / もう一度 displayRefs を呼ぶ", async () => {
        const h = await makeHarness();
        const k = kit(h);
        const id = k.id();
        await h.storage.put(id, k.file());
        await k.refOf(id);
        const replacement = k.file();
        await h.storage.put(id, replacement);
        expectServes(await h.fetch(await k.refOf(id)), replacement);
      });

      it("photoStorage#27 put した PhotoId の参照を得た後、delete した / もう一度 displayRefs を呼ぶ", async () => {
        const h = await makeHarness();
        const k = kit(h);
        const id = k.id();
        await h.storage.put(id, k.file());
        await k.refOf(id);
        await h.storage.delete(id);
        const ref = await k.refOf(id);
        expect(await h.fetch(ref)).toBeNull();
      });
    });

    describe("UnitOfWork との関係", () => {
      it("photoStorage#28 UnitOfWork の中で put し、その後に例外を投げた / その PhotoId の参照で取得する", async () => {
        const h = await makeHarness();
        const k = kit(h);
        const id = k.id();
        const file = k.file();
        await expect(
          h.uow.run(async () => {
            await h.storage.put(id, file);
            throw new ScopeAbort();
          }),
        ).rejects.toBeInstanceOf(ScopeAbort);
        expectServes(await k.served(id), file);
      });
    });
  });
}
