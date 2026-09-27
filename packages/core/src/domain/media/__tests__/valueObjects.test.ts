import { createHash } from "node:crypto";
import { isBusinessRuleError } from "@repo/core/domain/error";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { MediaErrorCode } from "../errorCode";
import { PhotoConsent } from "../photoConsent";
import { PhotoDigest, PhotoFormat } from "../photoFile";
import { PhotoIntake } from "../photoIntake";
import { PhotoPolicy } from "../photoPolicy";
import { sha256Hex } from "../sha256";

const T = new Date("2026-09-28T00:00:00.000Z");

const bytesOf = (text: string): Uint8Array => new TextEncoder().encode(text);

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (error) {
    if (isBusinessRuleError(error)) return error.code;
    throw error;
  }
  return undefined;
}

describe("sha256Hex", () => {
  it("matches the known digests of the empty string and 'abc'", () => {
    expect(sha256Hex(new Uint8Array())).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
    expect(sha256Hex(new TextEncoder().encode("abc"))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("agrees with node:crypto on any bytes, across block boundaries", () => {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 300 }), (bytes) => {
        expect(sha256Hex(bytes)).toBe(
          createHash("sha256").update(bytes).digest("hex"),
        );
      }),
    );
  });
});

describe("PhotoConsent", () => {
  it("agree records the moment of agreement", () => {
    expect(PhotoConsent.agree({ agreed: true }, T).agreedAt).toEqual(T);
  });

  it("agree without agreement is MEDIA_INVALID_CONSENT", () => {
    expect(codeOf(() => PhotoConsent.agree({ agreed: false }, T))).toBe(
      MediaErrorCode.InvalidConsent,
    );
  });

  it("equals compares agreedAt", () => {
    const a = PhotoConsent.agree({ agreed: true }, T);
    expect(
      PhotoConsent.equals(a, PhotoConsent.agree({ agreed: true }, T)),
    ).toBe(true);
    expect(
      PhotoConsent.equals(
        a,
        PhotoConsent.agree({ agreed: true }, new Date(T.getTime() + 1)),
      ),
    ).toBe(false);
  });
});

describe("PhotoFormat", () => {
  it.each(["image/jpeg", "image/png", "image/webp", "image/svg+xml"])(
    "accepts %s",
    (input) => {
      expect(PhotoFormat.create(input)).toBe(input);
    },
  );

  it.each(["video/mp4", "text/plain", "image/", "", "IMAGE/PNG", "jpeg"])(
    "refuses %j with MEDIA_INVALID_FORMAT",
    (input) => {
      expect(codeOf(() => PhotoFormat.create(input))).toBe(
        MediaErrorCode.InvalidFormat,
      );
    },
  );
});

describe("PhotoDigest", () => {
  it("of is the lowercase hex SHA-256 of the bytes", () => {
    const bytes = bytesOf("photo 1");
    expect(PhotoDigest.of(bytes)).toBe(
      createHash("sha256").update(bytes).digest("hex"),
    );
  });

  it("restore accepts only 64 lowercase hex digits", () => {
    const digest = PhotoDigest.of(bytesOf("photo"));
    expect(PhotoDigest.restore(digest)).toBe(digest);
    expect(() => PhotoDigest.restore(digest.toUpperCase())).toThrow();
    expect(() => PhotoDigest.restore("abc")).toThrow();
  });
});

describe("PhotoIntake", () => {
  const png = PhotoFormat.create("image/png");

  it("accept uses the inspected format and the bytes' digest", () => {
    const bytes = bytesOf("photo 2");
    const file = PhotoIntake.accept(bytes, { kind: "photo", format: png });
    expect(file.format).toBe("image/png");
    expect(file.digest).toBe(PhotoDigest.of(bytes));
    expect(file.bytes).toBe(bytes);
  });

  it("accept refuses a not_a_photo inspection with MEDIA_NOT_A_PHOTO", () => {
    expect(
      codeOf(() =>
        PhotoIntake.accept(new Uint8Array([1]), { kind: "not_a_photo" }),
      ),
    ).toBe(MediaErrorCode.NotAPhoto);
  });
});

describe("PhotoIntake.checkSize", () => {
  const policy = PhotoPolicy.create({ unownedRetentionMs: 1, maxBytes: 4 });

  it("accepts a file of at most maxBytes", () => {
    expect(() =>
      PhotoIntake.checkSize(new Uint8Array(4), policy),
    ).not.toThrow();
  });

  it("refuses a larger file with MEDIA_NOT_A_PHOTO", () => {
    expect(codeOf(() => PhotoIntake.checkSize(new Uint8Array(5), policy))).toBe(
      MediaErrorCode.NotAPhoto,
    );
  });
});

describe("PhotoPolicy", () => {
  it("create accepts a positive integer retention and size", () => {
    expect(PhotoPolicy.create({ unownedRetentionMs: 1, maxBytes: 1 })).toEqual({
      unownedRetentionMs: 1,
      maxBytes: 1,
    });
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "create refuses %s with MEDIA_INVALID_POLICY",
    (value) => {
      expect(
        codeOf(() =>
          PhotoPolicy.create({ unownedRetentionMs: value, maxBytes: 1 }),
        ),
      ).toBe(MediaErrorCode.InvalidPolicy);
      expect(
        codeOf(() =>
          PhotoPolicy.create({ unownedRetentionMs: 1, maxBytes: value }),
        ),
      ).toBe(MediaErrorCode.InvalidPolicy);
    },
  );

  it("sweepBefore is now minus the retention", () => {
    const policy = PhotoPolicy.create({
      unownedRetentionMs: 1000,
      maxBytes: 1,
    });
    expect(PhotoPolicy.sweepBefore(policy, T)).toEqual(
      new Date(T.getTime() - 1000),
    );
  });
});
