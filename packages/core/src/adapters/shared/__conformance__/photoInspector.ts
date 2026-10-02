import { PhotoFormat } from "@repo/core/domain/media/photoFile";
import type { PhotoInspector } from "@repo/core/domain/media/ports/photoInspector";
import { describe, expect, it } from "vitest";
import {
  disguisedAsJpeg,
  disguisedAsPng,
  sampleJpeg,
  samplePng,
  sampleText,
  sampleVideo,
  truncated,
} from "../testing/photoSamples";

/**
 * The `PhotoInspector` contract (`spec/testcases/ports/photoInspector.md`),
 * run against every implementation.
 */
export function describePhotoInspectorContract(
  makeInspector: () => PhotoInspector,
): void {
  describe("PhotoInspector contract", () => {
    it("photoInspector#1 JPEG の静止画のバイト列 / inspect する", async () => {
      expect(await makeInspector().inspect(sampleJpeg())).toEqual({
        kind: "photo",
        format: "image/jpeg",
      });
    });

    it("photoInspector#2 PNG の静止画のバイト列 / inspect する", async () => {
      expect(await makeInspector().inspect(samplePng())).toEqual({
        kind: "photo",
        format: "image/png",
      });
    });

    it("photoInspector#3 動画のファイルのバイト列 / inspect する", async () => {
      expect(await makeInspector().inspect(sampleVideo())).toEqual({
        kind: "not_a_photo",
      });
    });

    it("photoInspector#4 静止画のファイルの途中までしかない、壊れたバイト列 / inspect する", async () => {
      const inspector = makeInspector();
      for (const bytes of [truncated(sampleJpeg()), truncated(samplePng())]) {
        expect(await inspector.inspect(bytes)).toEqual({ kind: "not_a_photo" });
      }
    });

    it("photoInspector#5 テキストのファイルのバイト列 / inspect する", async () => {
      expect(await makeInspector().inspect(sampleText())).toEqual({
        kind: "not_a_photo",
      });
    });

    it("photoInspector#6 空のバイト列 / inspect する", async () => {
      expect(await makeInspector().inspect(new Uint8Array())).toEqual({
        kind: "not_a_photo",
      });
    });

    it("photoInspector#7 先頭だけが静止画の形式に見える、画像でないバイト列 / inspect する", async () => {
      const inspector = makeInspector();
      for (const bytes of [disguisedAsPng(), disguisedAsJpeg()]) {
        expect(await inspector.inspect(bytes)).toEqual({ kind: "not_a_photo" });
      }
    });

    it("photoInspector#8 PNG の静止画のバイト列（利用者は JPEG と申告している） / inspect する", async () => {
      // `inspect` takes the bytes only: there is no way to pass a declared type.
      expect(makeInspector().inspect.length).toBe(1);
      expect(await makeInspector().inspect(samplePng(8))).toEqual({
        kind: "photo",
        format: "image/png",
      });
    });

    it("photoInspector#9 同じ静止画のバイト列 / inspect を2回呼ぶ", async () => {
      const inspector = makeInspector();
      const bytes = sampleJpeg();
      expect(await inspector.inspect(bytes)).toEqual(
        await inspector.inspect(bytes),
      );
    });

    it("photoInspector#10 同じ静止画でないバイト列 / inspect を2回呼ぶ", async () => {
      const inspector = makeInspector();
      const bytes = sampleText();
      expect(await inspector.inspect(bytes)).toEqual({ kind: "not_a_photo" });
      expect(await inspector.inspect(bytes)).toEqual({ kind: "not_a_photo" });
    });

    it("photoInspector#11 返された format / PhotoFormat.create に渡す", async () => {
      const inspector = makeInspector();
      for (const bytes of [sampleJpeg(), samplePng()]) {
        const inspection = await inspector.inspect(bytes);
        if (inspection.kind !== "photo") throw new Error("expected a photo");
        expect(PhotoFormat.create(inspection.format)).toBe(inspection.format);
        expect(inspection.format.startsWith("image/")).toBe(true);
      }
    });
  });
}
