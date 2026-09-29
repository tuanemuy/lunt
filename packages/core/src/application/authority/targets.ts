import type { StewardedTargetDirectory } from "@repo/core/domain/authority/ports/stewardedTargetDirectory";
import type { StewardedRef } from "@repo/core/domain/common/refs";
import { NotFoundError } from "../errors";

const NOT_FOUND_CODE = {
  place: "PLACE_NOT_FOUND",
  region: "REGION_NOT_FOUND",
  occasion: "OCCASION_NOT_FOUND",
} as const satisfies Readonly<Record<StewardedRef["kind"], string>>;

/**
 * `NotFoundError` (`{PLACE|REGION|OCCASION}_NOT_FOUND`) unless `target`
 * exists, whatever its publication or suspension. For management usecases
 * that key on a target without reading it: called before the unit of work,
 * so a missing target is reported ahead of the access check
 * (`spec/domains/index.md` 「エラーの種類」).
 */
export async function requireExistingTarget(
  directory: StewardedTargetDirectory,
  target: StewardedRef,
): Promise<void> {
  const [found] = await directory.describe([target]);
  if (found === undefined) {
    throw new NotFoundError(
      NOT_FOUND_CODE[target.kind],
      `The ${target.kind} ${target.id} does not exist`,
    );
  }
}
