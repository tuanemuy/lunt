import {
  type FieldComparison,
  FieldPatch,
  type FieldPatchSchema,
  type PhotoFieldOf,
  type ValueOf,
} from "@repo/core/domain/common/fieldPatch";
import { PhotoId } from "@repo/core/domain/common/ids";
import { PhotoSet } from "@repo/core/domain/common/photoSet";
import { RevisedPhotos } from "@repo/core/domain/common/revisedPhotos";
import { describe, expect, expectTypeOf, it } from "vitest";
import { expectBusinessError } from "./expectBusinessError";

const CODE = "COMMON_INVALID_FIELD_PATCH";
const id = PhotoId.create;

type Photo = { photoId: PhotoId };
type Content = Readonly<{
  name: string | null;
  price: number;
  photos: PhotoSet<Photo>;
}>;
type Change =
  | Readonly<{ field: "name"; value: string }>
  | Readonly<{ field: "price"; value: number }>
  | Readonly<{ field: "photos"; value: RevisedPhotos<Photo> }>;
type Current = { name: string | null; price: number; photos: PhotoSet<Photo> };

const schema: FieldPatchSchema<Content, Change, Current> = {
  order: ["name", "price", "photos"],
  photoField: "photos",
  fields: {
    name: {
      read: (s) => s.name,
      equals: (a, b) => a === b,
      propose: (_current, desired) => desired ?? "",
      overlay: (s, value) => ({ ...s, name: value }),
    },
    price: {
      read: (s) => s.price,
      equals: (a, b) => a === b,
      propose: (_current, desired) => desired,
      overlay: (s, value) => ({ ...s, price: value }),
    },
    photos: {
      read: (s) => s.photos,
      equals: (a, b) =>
        a.items.length === b.items.length &&
        a.items.every((p, i) => p.photoId === b.items[i]?.photoId),
      propose: (current, desired) => RevisedPhotos.between(current, desired),
      overlay: (s, value) => ({
        ...s,
        photos: RevisedPhotos.overlay(s.photos, value),
      }),
    },
  },
};

const photos = (...raws: string[]) =>
  PhotoSet.of(
    raws.map((raw) => ({ photoId: id(raw) })),
    "LISTING",
  );
const content = (over: Partial<Content> = {}): Content => ({
  name: "Cafe",
  price: 500,
  photos: photos("a", "b"),
  ...over,
});

describe("FieldPatch.create", () => {
  it("keeps the given changes", () => {
    const patch = FieldPatch.create<Change>([
      { field: "price", value: 600 },
      { field: "name", value: "x" },
    ]);
    expect(patch).toEqual([
      { field: "price", value: 600 },
      { field: "name", value: "x" },
    ]);
  });

  it("zero changes is COMMON_INVALID_FIELD_PATCH", () => {
    expectBusinessError(() => FieldPatch.create<Change>([]), CODE);
  });

  it("a repeated field is COMMON_INVALID_FIELD_PATCH", () => {
    expectBusinessError(
      () =>
        FieldPatch.create<Change>([
          { field: "price", value: 600 },
          { field: "price", value: 700 },
        ]),
      CODE,
    );
  });
});

describe("FieldPatch.between", () => {
  it("lists only differing fields, in schema order, valued by propose", () => {
    const current = content();
    const desired = content({ price: 700, name: "Cafe Lunt" });
    expect(FieldPatch.between(schema, current, desired)).toEqual([
      { field: "name", value: "Cafe Lunt" },
      { field: "price", value: 700 },
    ]);
  });

  it("the photo field is proposed as RevisedPhotos", () => {
    const patch = FieldPatch.between(
      schema,
      content(),
      content({ photos: photos("b", "x") }),
    );
    expect(patch).toEqual([
      {
        field: "photos",
        value: [
          { photoId: "b", origin: "current" },
          { photoId: "x", origin: "added" },
        ],
      },
    ]);
  });

  it("no difference is COMMON_INVALID_FIELD_PATCH", () => {
    expectBusinessError(
      () => FieldPatch.between(schema, content(), content()),
      CODE,
    );
  });

  it("a field missing on the target (null) differs from a value", () => {
    expect(
      FieldPatch.between(schema, content({ name: null }), content()),
    ).toEqual([{ field: "name", value: "Cafe" }]);
  });

  it("infers the domain's change type from the schema", () => {
    const patch = FieldPatch.between(schema, content(), content({ price: 1 }));
    expectTypeOf(patch).toEqualTypeOf<FieldPatch<Change>>();
    expectTypeOf<ValueOf<Change, "price">>().toEqualTypeOf<number>();
    expectTypeOf<PhotoFieldOf<Change>>().toEqualTypeOf<"photos">();
  });
});

describe("FieldPatch.preview", () => {
  it("overlays every change; untouched fields keep the target's present values", () => {
    const current = content();
    const patch = FieldPatch.create<Change>([{ field: "price", value: 900 }]);
    expect(FieldPatch.preview(schema, current, patch)).toEqual({
      ...current,
      price: 900,
    });
  });

  it("reads the target at preview time, not at submission", () => {
    const atSubmission = content();
    const patch = FieldPatch.between(
      schema,
      atSubmission,
      content({ price: 900 }),
    );
    const later = content({ name: "Renamed meanwhile" });
    expect(FieldPatch.preview(schema, later, patch).name).toBe(
      "Renamed meanwhile",
    );
  });

  it("photos removed from the target after submission do not come back", () => {
    const atSubmission = content({ photos: photos("a", "b", "c") });
    const patch = FieldPatch.between(
      schema,
      atSubmission,
      content({ photos: photos("c", "x", "a") }),
    );
    const later = content({
      photos: PhotoSet.takeDown(photos("a", "b", "c"), [id("a")], "LISTING"),
    });
    expect(
      PhotoSet.photoIds(FieldPatch.preview(schema, later, patch).photos),
    ).toEqual(["c", "x"]);
  });
});

describe("FieldPatch.compare", () => {
  it("per changed field in schema order: the present value and the proposal", () => {
    const current = content();
    const patch = FieldPatch.create<Change>([
      { field: "price", value: 900 },
      { field: "name", value: "New" },
    ]);
    const comparisons = FieldPatch.compare(schema, current, patch);
    expect(comparisons).toEqual([
      { field: "name", current: "Cafe", proposed: "New" },
      { field: "price", current: 500, proposed: 900 },
    ]);
    expectTypeOf(comparisons).toEqualTypeOf<
      readonly FieldComparison<Change, Current>[]
    >();
  });

  it("the photo field compares the PhotoSet with the RevisedPhotos", () => {
    const current = content();
    const patch = FieldPatch.between(
      schema,
      current,
      content({ photos: photos("x") }),
    );
    const [comparison] = FieldPatch.compare(schema, current, patch);
    expect(comparison?.field).toBe("photos");
    expect(comparison?.current).toBe(current.photos);
    expect(comparison?.proposed).toEqual([{ photoId: "x", origin: "added" }]);
  });
});

describe("FieldPatch.addedPhotoIds", () => {
  it("is the added photos of the photo field", () => {
    const patch = FieldPatch.between(
      schema,
      content(),
      content({ photos: photos("y", "a", "x"), price: 1 }),
    );
    expect(FieldPatch.addedPhotoIds(schema, patch)).toEqual(["y", "x"]);
  });

  it("is empty when the patch has no photo field", () => {
    const patch = FieldPatch.create<Change>([{ field: "price", value: 1 }]);
    expect(FieldPatch.addedPhotoIds(schema, patch)).toEqual([]);
  });

  it("is empty when the schema has no photo field", () => {
    const patch = FieldPatch.create<Change>([
      { field: "photos", value: [{ photoId: id("x"), origin: "added" }] },
    ]);
    const withoutPhotoField: FieldPatchSchema<Content, Change, Current> = {
      ...schema,
      photoField: null,
    };
    expect(FieldPatch.addedPhotoIds(withoutPhotoField, patch)).toEqual([]);
  });
});

describe("FieldPatch accessors", () => {
  it("valueOf returns the typed change value or undefined", () => {
    const patch = FieldPatch.create<Change>([{ field: "price", value: 1 }]);
    const price = FieldPatch.valueOf(patch, "price");
    expectTypeOf(price).toEqualTypeOf<number | undefined>();
    expect(price).toBe(1);
    expect(FieldPatch.valueOf(patch, "name")).toBeUndefined();
    expect(FieldPatch.fields(patch)).toEqual(["price"]);
  });
});
