import { DoContentDirectory } from "@repo/core/adapters/do/contentDirectory";
import { IdBatch } from "@repo/core/domain/common/idBatch";
import type { PhotoId } from "@repo/core/domain/common/ids";
import { ContentRef } from "@repo/core/domain/common/refs";
import {
  type ContentDirectory,
  ContentOrder,
  type ContentSummary,
} from "@repo/core/domain/moderation/ports/contentDirectory";
import type { TestServiceDeps } from "../../__tests__/testServiceDeps";
import type { ModerationServices } from "../services";

/**
 * Moderation's container ports for usecase tests: fakes for external IO,
 * the real adapters (over the in-process state object) for everything
 * else.
 */
export function createTestModerationServices(
  deps: TestServiceDeps,
): ModerationServices {
  return { contentDirectory: new DoContentDirectory(deps.client) };
}

/**
 * Test-only `ContentDirectory` holding the targets a test adds, for tests
 * that name targets without storing them: `createTestContainer({ overrides:
 * () => ({ contentDirectory: directory }) })`. It keeps the port's contract
 * (0–100 targets, existing ones only, `ContentOrder`).
 */
export class TestContentDirectory implements ContentDirectory {
  private readonly targets = new Map<string, ContentSummary>();

  /** Registers `target` as existing with `name` (`null`: not entered yet). */
  add(
    target: ContentRef,
    name: string | null,
    photoIds: readonly PhotoId[] = [],
  ): this {
    this.targets.set(ContentRef.key(target), { target, name, photoIds });
    return this;
  }

  /** Deletes `target` (a deleted listing). */
  remove(target: ContentRef): this {
    this.targets.delete(ContentRef.key(target));
    return this;
  }

  async describe(
    targets: readonly ContentRef[],
  ): Promise<readonly ContentSummary[]> {
    IdBatch.assertWithinLimit(targets);
    const found = new Map<string, ContentSummary>();
    for (const target of targets) {
      const summary = this.targets.get(ContentRef.key(target));
      if (summary !== undefined) found.set(ContentRef.key(target), summary);
    }
    return [...found.values()].sort((a, b) =>
      ContentOrder.compare(a.target, b.target),
    );
  }
}
