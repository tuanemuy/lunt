import type { IdGenerator } from "@repo/core/application/ports/idGenerator";
import { IdBatch } from "@repo/core/domain/common/idBatch";
import type { ContentRef, ShowcaseRef } from "@repo/core/domain/common/refs";
import type {
  ReferenceResolution,
  ResolvedTarget,
} from "@repo/core/domain/discovery/entry";
import type { ReferenceQueries } from "@repo/core/domain/discovery/ports/referenceQueries";
import { listingEntryFrom, placeEntryFrom } from "./detailQueries";
import { mapDoError } from "./helpers";
import type { LuntStateClient } from "./protocol/client";
import type { ReferenceResolutionRecord } from "./protocol/discovery";

/**
 * `ReferenceQueries` over the Lunt state object. The object answers each
 * distinct ref in first-seen order; this side pairs every answer with the
 * caller's own ref value and rehydrates viewable targets. Read-only; never
 * joins a unit of work.
 */
export class DoReferenceQueries implements ReferenceQueries {
  constructor(
    private readonly client: Pick<LuntStateClient, "query">,
    private readonly idGenerator: IdGenerator,
  ) {}

  async resolve(
    refs: readonly ShowcaseRef[],
  ): Promise<readonly ReferenceResolution[]> {
    IdBatch.assertWithinLimit(refs);
    const distinct = [
      ...new Map(refs.map((ref) => [`${ref.kind}:${ref.id}`, ref])).values(),
    ];
    if (distinct.length === 0) return [];
    return mapDoError("Failed to resolve references", async () => {
      const records = await this.client.query("discovery.resolve", {
        refs: distinct.map(({ kind, id }) => ({ kind, id })),
      });
      return distinct.map((ref, i) => this.toResolution(ref, records[i]));
    });
  }

  isViewable(ref: ContentRef): Promise<boolean> {
    return mapDoError("Failed to check viewability", () =>
      this.client.query("discovery.isViewable", {
        ref: { kind: ref.kind, id: ref.id },
      }),
    );
  }

  private toResolution(
    ref: ShowcaseRef,
    record: ReferenceResolutionRecord | undefined,
  ): ReferenceResolution {
    if (record === undefined || !record.viewable) {
      return { ref, viewable: false };
    }
    return { ref, viewable: true, target: this.toTarget(record.target) };
  }

  private toTarget(
    target: Extract<ReferenceResolutionRecord, { viewable: true }>["target"],
  ): ResolvedTarget {
    switch (target.kind) {
      case "listing":
        return {
          kind: "listing",
          entry: listingEntryFrom(target.entry, this.idGenerator),
        };
      case "place":
        return {
          kind: "place",
          entry: placeEntryFrom(target.entry, this.idGenerator),
        };
    }
  }
}
