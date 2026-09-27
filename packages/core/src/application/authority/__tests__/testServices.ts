import { DoStewardedTargetDirectory } from "@repo/core/adapters/do/stewardedTargetDirectory";
import type { StewardedTargetDirectory } from "@repo/core/domain/authority/ports/stewardedTargetDirectory";
import {
  StewardedTargetOrder,
  type StewardedTargetSummary,
} from "@repo/core/domain/authority/stewardedTarget";
import { IdBatch } from "@repo/core/domain/common/idBatch";
import { ContentRef, type StewardedRef } from "@repo/core/domain/common/refs";
import type { TestServiceDeps } from "../../__tests__/testServiceDeps";
import type { AuthorityServices } from "../services";

/**
 * Authority's container ports for usecase tests: fakes for external IO,
 * the real adapters (over the in-process state object) for everything
 * else.
 */
export function createTestAuthorityServices(
  deps: TestServiceDeps,
): AuthorityServices {
  return {
    stewardedTargetDirectory: new DoStewardedTargetDirectory(deps.client),
  };
}

/**
 * Test-only `StewardedTargetDirectory` holding the targets a test adds.
 * No target kind has its tables yet in P1 (places arrive in S2A, regions
 * and occasions in S3A), so a usecase test that needs a target to exist
 * swaps this in: `createTestContainer({ overrides: () => ({
 * stewardedTargetDirectory: targets }) })`. It keeps the port's contract
 * (0–100 targets, existing ones only, listing order).
 */
export class TestStewardedTargets implements StewardedTargetDirectory {
  private readonly targets = new Map<string, StewardedTargetSummary>();

  /** Registers `target` as existing, with `name` (`null`: unnamed draft). */
  add(target: StewardedRef, name: string | null): this {
    this.targets.set(ContentRef.key(target), { target, name });
    return this;
  }

  async describe(
    targets: readonly StewardedRef[],
  ): Promise<readonly StewardedTargetSummary[]> {
    IdBatch.assertWithinLimit(targets);
    const found = new Map<string, StewardedTargetSummary>();
    for (const target of targets) {
      const summary = this.targets.get(ContentRef.key(target));
      if (summary !== undefined) found.set(ContentRef.key(target), summary);
    }
    return [...found.values()].sort((a, b) =>
      StewardedTargetOrder.compare(a.target, b.target),
    );
  }
}
