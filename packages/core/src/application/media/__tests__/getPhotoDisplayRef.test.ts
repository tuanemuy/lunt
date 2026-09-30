import { describe, expect, it } from "vitest";
import { getPhotoDisplayRef } from "../getPhotoDisplayRef";
import { mediaKit } from "./kit";

describe("getPhotoDisplayRef", () => {
  it("returns the ref that serves a just-registered photo", async () => {
    const k = mediaKit();
    const bytes = k.bytes();
    const photoId = await k.register(k.person(), { bytes });

    const ref = await getPhotoDisplayRef({
      container: k.container,
      input: { photoId },
    });

    expect(ref).toEqual((await k.storage.displayRefs([photoId])).get(photoId));
    expect(await k.served(photoId)).toEqual(bytes);
  });
});
