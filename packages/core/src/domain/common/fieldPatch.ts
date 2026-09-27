import { CommonErrorCode } from "@repo/core/domain/common/errorCode";
import type { PhotoId } from "@repo/core/domain/common/ids";
import type { PhotoItem } from "@repo/core/domain/common/photoSet";
import { RevisedPhotos } from "@repo/core/domain/common/revisedPhotos";
import { BusinessRuleError } from "@repo/core/domain/error";

/** One changed field of a revision. Domains define `C` as a union keyed by `field`. */
export type FieldChange = Readonly<{ field: string; value: unknown }>;

/** One or more changes, at most one per `field`. Built only by `create` / `between`. */
export type FieldPatch<C extends FieldChange> = readonly [C, ...C[]];

export type ValueOf<C extends FieldChange, F extends C["field"]> = Extract<
  C,
  { field: F }
>["value"];

/** Per-field type of the target's present value (see `FieldPatchSchema`). */
export type CurrentValues<C extends FieldChange> = {
  [F in C["field"]]: unknown;
};

export type FieldSpec<
  S,
  C extends FieldChange,
  Current extends CurrentValues<C>,
  F extends C["field"],
> = {
  /** The target's present value of this field. */
  readonly read: (state: S) => Current[F];
  readonly equals: (a: Current[F], b: Current[F]) => boolean;
  /** The change value: `RevisedPhotos.between` for photos, `desired` otherwise. */
  readonly propose: (current: Current[F], desired: Current[F]) => ValueOf<C, F>;
  /** Lays one change onto `state`: `RevisedPhotos.overlay` for photos, replacement otherwise. */
  readonly overlay: (state: S, value: ValueOf<C, F>) => S;
};

/** The fields of `C` whose change value is a `RevisedPhotos`. */
export type PhotoFieldOf<C extends FieldChange> = {
  [F in C["field"]]: ValueOf<C, F> extends RevisedPhotos<PhotoItem> ? F : never;
}[C["field"]];

// Written as a plain object type (not `Readonly<…>`) so the alias survives on
// annotated schemas: `FieldPatch.*` infers `Current` only from the alias's
// type arguments, never from the mapped `fields` structure.
/**
 * How a domain reads, compares, proposes and overlays each field of its
 * content `S`. `Current[F]` is the present-value type: `PhotoSet` for the
 * photo field, the change value type otherwise (widened with `null` where an
 * unpublished target may lack the field).
 *
 * Declare schemas with an explicit annotation
 * (`const schema: FieldPatchSchema<S, C, Current> = …`), not `satisfies` or a
 * spread copy — otherwise `FieldPatch.*` cannot infer the type arguments.
 */
export type FieldPatchSchema<
  S,
  C extends FieldChange,
  Current extends CurrentValues<C>,
> = {
  /** Field definition order; every field exactly once. */
  readonly order: readonly C["field"][];
  readonly photoField: PhotoFieldOf<C> | null;
  readonly fields: {
    readonly [F in C["field"]]: FieldSpec<S, C, Current, F>;
  };
};

export type FieldComparison<
  C extends FieldChange,
  Current extends CurrentValues<C>,
> = {
  [F in C["field"]]: Readonly<{
    field: F;
    current: Current[F];
    proposed: ValueOf<C, F>;
  }>;
}[C["field"]];

// The per-field generics cannot be correlated with a runtime `field` string,
// so the functions below go through this erased view; the exported
// signatures carry the precise types.
type LooseSpec<S> = {
  readonly read: (state: S) => unknown;
  readonly equals: (a: unknown, b: unknown) => boolean;
  readonly propose: (current: unknown, desired: unknown) => unknown;
  readonly overlay: (state: S, value: unknown) => S;
};

const specOf = <S, C extends FieldChange, Current extends CurrentValues<C>>(
  schema: FieldPatchSchema<S, C, Current>,
  field: C["field"],
): LooseSpec<S> => schema.fields[field] as unknown as LooseSpec<S>;

const invalidPatch = (message: string): BusinessRuleError<CommonErrorCode> =>
  new BusinessRuleError(CommonErrorCode.InvalidFieldPatch, message);

const isNonEmpty = <T>(items: readonly T[]): items is readonly [T, ...T[]] =>
  items.length > 0;

const create = <C extends FieldChange>(
  changes: readonly C[],
): FieldPatch<C> => {
  if (!isNonEmpty(changes)) {
    throw invalidPatch("A revision must change at least one field");
  }
  const fields = new Set(changes.map((change) => change.field));
  if (fields.size !== changes.length) {
    throw invalidPatch("A revision may change each field at most once");
  }
  return changes;
};

const findChange = <C extends FieldChange, F extends C["field"]>(
  patch: FieldPatch<C>,
  field: F,
): Extract<C, { field: F }> | undefined =>
  patch.find((change) => change.field === field) as
    | Extract<C, { field: F }>
    | undefined;

export const FieldPatch = {
  /** Throws `COMMON_INVALID_FIELD_PATCH` when empty or when a `field` repeats. */
  create,

  /**
   * The fields whose values differ (`equals`), in `order`, valued by
   * `propose`. Throws `COMMON_INVALID_FIELD_PATCH` when nothing differs.
   */
  between: <S, C extends FieldChange, Current extends CurrentValues<C>>(
    schema: FieldPatchSchema<S, C, Current>,
    current: S,
    desired: S,
  ): FieldPatch<C> => {
    const changes: C[] = [];
    for (const field of schema.order) {
      const spec = specOf(schema, field);
      const a = spec.read(current);
      const b = spec.read(desired);
      if (!spec.equals(a, b)) {
        changes.push({ field, value: spec.propose(a, b) } as unknown as C);
      }
    }
    if (!isNonEmpty(changes)) {
      throw invalidPatch(
        "The revision does not differ from the current content",
      );
    }
    return create(changes);
  },

  /**
   * `current` with every change of `patch` overlaid; unchanged fields keep
   * their present values. What approval applies and what a resubmission
   * starts from.
   */
  preview: <S, C extends FieldChange, Current extends CurrentValues<C>>(
    schema: FieldPatchSchema<S, C, Current>,
    current: S,
    patch: FieldPatch<C>,
  ): S =>
    patch.reduce(
      (state, change) =>
        specOf(schema, change.field).overlay(state, change.value),
      current,
    ),

  /** Per changed field, in `order`: the present value (`read`) and the proposed one. */
  compare: <S, C extends FieldChange, Current extends CurrentValues<C>>(
    schema: FieldPatchSchema<S, C, Current>,
    current: S,
    patch: FieldPatch<C>,
  ): readonly FieldComparison<C, Current>[] =>
    schema.order.flatMap((field) => {
      const change = findChange(patch, field);
      if (change === undefined) return [];
      return [
        {
          field,
          current: specOf(schema, field).read(current),
          proposed: change.value,
        } as unknown as FieldComparison<C, Current>,
      ];
    }),

  /** `RevisedPhotos.addedPhotoIds` of the photo field; empty when it is not in the patch. */
  addedPhotoIds: <S, C extends FieldChange, Current extends CurrentValues<C>>(
    schema: FieldPatchSchema<S, C, Current>,
    patch: FieldPatch<C>,
  ): readonly PhotoId[] => {
    if (schema.photoField === null) return [];
    const change = findChange(patch, schema.photoField);
    if (change === undefined) return [];
    return RevisedPhotos.addedPhotoIds(
      change.value as RevisedPhotos<PhotoItem>,
    );
  },

  /** The change value for `field`, if the patch changes it. */
  valueOf: <C extends FieldChange, F extends C["field"]>(
    patch: FieldPatch<C>,
    field: F,
  ): ValueOf<C, F> | undefined => findChange(patch, field)?.value,

  fields: <C extends FieldChange>(
    patch: FieldPatch<C>,
  ): readonly C["field"][] => patch.map((change) => change.field),
};
