import type { Actor } from "@repo/core/domain/common/actor";
import {
  AccountId,
  ApplicationId,
  ListingId,
  PhotoId,
} from "@repo/core/domain/common/ids";
import type { PhotoOwnerRef } from "@repo/core/domain/common/refs";
import {
  isBusinessRuleError,
  isRehydrationError,
} from "@repo/core/domain/error";
import { describe, expect, it } from "vitest";
import { MediaErrorCode } from "../errorCode";
import {
  type AcceptedPhoto,
  PhotoAsset,
  type PhotoAssetSnapshot,
  type StoredPhoto,
} from "../photoAsset";
import { PhotoConsent } from "../photoConsent";
import { PhotoFormat } from "../photoFile";
import { PhotoIntake } from "../photoIntake";
import { PhotoOwnership } from "../photoOwnership";

const T = new Date("2026-09-28T00:00:00.000Z");
const later = (ms: number) => new Date(T.getTime() + ms);

const alice: Actor = { accountId: AccountId.create("alice") };
const bob: Actor = { accountId: AccountId.create("bob") };
const listing: PhotoOwnerRef = {
  kind: "listing",
  id: ListingId.create("listing-1"),
};
const application = {
  kind: "application",
  id: ApplicationId.create("application-1"),
} as const;

const fileOf = (text: string) =>
  PhotoIntake.accept(new TextEncoder().encode(text), {
    kind: "photo",
    format: PhotoFormat.create("image/png"),
  });

function accepted(id = "p1", by: Actor = alice, text = "photo"): AcceptedPhoto {
  return PhotoAsset.register(
    {
      id: PhotoId.create(id),
      registrant: by,
      consent: PhotoConsent.agree({ agreed: true }, T),
      file: fileOf(text),
    },
    later(5),
  );
}

const stored = (id = "p1", by: Actor = alice): StoredPhoto =>
  PhotoAsset.markStored(accepted(id, by));

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (error) {
    if (isBusinessRuleError(error)) return error.code;
    throw error;
  }
  return undefined;
}

describe("PhotoAsset.register", () => {
  it("accepts the photo with its registrant, consent time and file digest", () => {
    const photo = accepted();
    expect(photo).toMatchObject({
      stage: "accepted",
      registeredBy: alice.accountId,
      consentedAt: T,
      digest: fileOf("photo").digest,
      registeredAt: later(5),
      version: 0,
    });
  });
});

describe("PhotoAsset.duplicate", () => {
  it("keeps the source's consent and digest, registered by the duplicator", () => {
    const source = PhotoAsset.claim(stored(), listing, alice);
    const copy = PhotoAsset.duplicate(
      source,
      { id: PhotoId.create("p2"), by: bob },
      later(100),
    );
    expect(copy).toEqual({
      id: "p2",
      registeredBy: bob.accountId,
      consentedAt: source.consentedAt,
      digest: source.digest,
      registeredAt: later(100),
      version: 0,
      stage: "accepted",
    });
  });

  it.each([
    ["no record", null],
    ["accepted", accepted()],
    ["discarded", PhotoAsset.discard(stored())],
  ])(
    "refuses a %s source with MEDIA_DUPLICATE_SOURCE_UNAVAILABLE",
    (_, source) => {
      expect(
        codeOf(() =>
          PhotoAsset.duplicate(
            source,
            { id: PhotoId.create("p2"), by: alice },
            T,
          ),
        ),
      ).toBe(MediaErrorCode.DuplicateSourceUnavailable);
    },
  );
});

describe("PhotoAsset.isResendOf", () => {
  it("is true for the same registrant and file only", () => {
    const photo = accepted();
    expect(
      PhotoAsset.isResendOf(photo, {
        registrant: alice,
        file: fileOf("photo"),
      }),
    ).toBe(true);
    expect(
      PhotoAsset.isResendOf(photo, { registrant: bob, file: fileOf("photo") }),
    ).toBe(false);
    expect(
      PhotoAsset.isResendOf(photo, {
        registrant: alice,
        file: fileOf("other"),
      }),
    ).toBe(false);
  });
});

describe("PhotoAsset.markStored / claim / transfer / discard", () => {
  it("markStored stores the photo without an owner and advances the version", () => {
    expect(stored()).toMatchObject({
      stage: "stored",
      owner: null,
      version: 1,
    });
  });

  it("claim sets the first owner for the registrant", () => {
    expect(PhotoAsset.claim(stored(), listing, alice)).toMatchObject({
      owner: listing,
      version: 2,
    });
  });

  it("claim refuses a photo that is not stored", () => {
    expect(codeOf(() => PhotoAsset.claim(accepted(), listing, alice))).toBe(
      MediaErrorCode.PhotoNotAvailable,
    );
    expect(
      codeOf(() =>
        PhotoAsset.claim(PhotoAsset.discard(stored()), listing, alice),
      ),
    ).toBe(MediaErrorCode.PhotoNotAvailable);
  });

  it("claim refuses an owned photo, even for the same owner", () => {
    const owned = PhotoAsset.claim(stored(), listing, alice);
    expect(codeOf(() => PhotoAsset.claim(owned, listing, alice))).toBe(
      MediaErrorCode.PhotoAlreadyOwned,
    );
    expect(codeOf(() => PhotoAsset.claim(owned, application, alice))).toBe(
      MediaErrorCode.PhotoAlreadyOwned,
    );
  });

  it("claim refuses anyone but the registrant", () => {
    expect(codeOf(() => PhotoAsset.claim(stored(), listing, bob))).toBe(
      MediaErrorCode.PhotoNotRegistrant,
    );
  });

  it("transfer moves the owner from the application to the aggregate", () => {
    const owned = PhotoAsset.claim(stored(), application, alice);
    expect(PhotoAsset.transfer(owned, application, listing)).toMatchObject({
      owner: listing,
      version: 3,
    });
  });

  it("transfer refuses a photo the application does not own", () => {
    const other = {
      kind: "application",
      id: ApplicationId.create("x"),
    } as const;
    for (const photo of [
      accepted(),
      stored(),
      PhotoAsset.claim(stored(), listing, alice),
      PhotoAsset.claim(stored(), other, alice),
      PhotoAsset.discard(PhotoAsset.claim(stored(), application, alice)),
    ]) {
      expect(
        codeOf(() => PhotoAsset.transfer(photo, application, listing)),
      ).toBe(MediaErrorCode.PhotoOwnerMismatch);
    }
  });

  it("discard drops the owner and advances the version", () => {
    const owned = PhotoAsset.claim(stored(), listing, alice);
    const discarded = PhotoAsset.discard(owned);
    expect(discarded).toMatchObject({ stage: "discarded", version: 3 });
    expect("owner" in discarded).toBe(false);
    expect(PhotoAsset.discard(accepted()).stage).toBe("discarded");
  });
});

describe("PhotoAsset.isAbandoned", () => {
  const photo = accepted();
  const after = later(6);

  it("holds for accepted and unowned stored photos registered before the deadline", () => {
    expect(PhotoAsset.isAbandoned(photo, after)).toBe(true);
    expect(PhotoAsset.isAbandoned(PhotoAsset.markStored(photo), after)).toBe(
      true,
    );
  });

  it("does not hold at or before the registration time", () => {
    expect(PhotoAsset.isAbandoned(photo, later(5))).toBe(false);
    expect(PhotoAsset.isAbandoned(photo, T)).toBe(false);
  });

  it("does not hold for owned or discarded photos", () => {
    const owned = PhotoAsset.claim(
      PhotoAsset.markStored(photo),
      listing,
      alice,
    );
    expect(PhotoAsset.isAbandoned(owned, after)).toBe(false);
    expect(PhotoAsset.isAbandoned(PhotoAsset.discard(photo), after)).toBe(
      false,
    );
  });
});

describe("PhotoAsset.reconstruct", () => {
  it("round-trips every stage through snapshot", () => {
    for (const photo of [
      accepted(),
      stored(),
      PhotoAsset.claim(stored(), application, alice),
      PhotoAsset.discard(stored()),
    ]) {
      expect(PhotoAsset.reconstruct(PhotoAsset.snapshot(photo))).toEqual(photo);
    }
  });

  const base: PhotoAssetSnapshot = PhotoAsset.snapshot(stored());

  it.each<[string, Partial<PhotoAssetSnapshot>]>([
    ["an owned accepted photo", { stage: "accepted", owner: listing }],
    ["an owned discarded photo", { stage: "discarded", owner: listing }],
    ["an unknown stage", { stage: "lost" }],
    ["an unknown owner kind", { owner: { kind: "shop", id: "s" } }],
    ["a malformed digest", { digest: "xyz" }],
    ["an invalid date", { registeredAt: new Date(Number.NaN) }],
    ["a blank id", { id: " " }],
  ])("refuses %s with RehydrationError", (_, patch) => {
    let caught: unknown;
    try {
      PhotoAsset.reconstruct({ ...base, ...patch });
    } catch (error) {
      caught = error;
    }
    expect(isRehydrationError(caught)).toBe(true);
  });
});

describe("PhotoOwnership", () => {
  it("claimAll claims every listed photo and nothing else", () => {
    const a = stored("a");
    const b = stored("b");
    const c = stored("c");
    const claimed = PhotoOwnership.claimAll(
      [a, b, c],
      [a.id, c.id],
      listing,
      alice,
    );
    expect(claimed.map((p) => [p.id, p.owner])).toEqual([
      ["a", listing],
      ["c", listing],
    ]);
  });

  it("claimAll handles a repeated id once", () => {
    const a = stored("a");
    expect(
      PhotoOwnership.claimAll([a], [a.id, a.id], listing, alice),
    ).toHaveLength(1);
  });

  it("claimAll fails as a whole when a photo is missing", () => {
    expect(
      codeOf(() =>
        PhotoOwnership.claimAll(
          [stored("a")],
          [PhotoId.create("a"), PhotoId.create("gone")],
          listing,
          alice,
        ),
      ),
    ).toBe(MediaErrorCode.PhotoNotAvailable);
  });

  it("claimAll fails as a whole when one photo cannot be claimed", () => {
    const a = stored("a");
    const b = PhotoAsset.claim(stored("b"), application, alice);
    expect(
      codeOf(() =>
        PhotoOwnership.claimAll([a, b], [a.id, b.id], listing, alice),
      ),
    ).toBe(MediaErrorCode.PhotoAlreadyOwned);
  });

  it("transferAll moves every listed photo from the application", () => {
    const a = PhotoAsset.claim(stored("a"), application, alice);
    const b = PhotoAsset.claim(stored("b"), application, alice);
    const moved = PhotoOwnership.transferAll(
      [a, b],
      [a.id, b.id],
      application,
      listing,
    );
    expect(moved.map((p) => p.owner)).toEqual([listing, listing]);
  });

  it("transferAll fails when a photo is missing or not the application's", () => {
    const a = PhotoAsset.claim(stored("a"), application, alice);
    expect(
      codeOf(() =>
        PhotoOwnership.transferAll(
          [a],
          [a.id, PhotoId.create("gone")],
          application,
          listing,
        ),
      ),
    ).toBe(MediaErrorCode.PhotoNotAvailable);
    expect(
      codeOf(() =>
        PhotoOwnership.transferAll(
          [stored("b")],
          [PhotoId.create("b")],
          application,
          listing,
        ),
      ),
    ).toBe(MediaErrorCode.PhotoOwnerMismatch);
  });
});
