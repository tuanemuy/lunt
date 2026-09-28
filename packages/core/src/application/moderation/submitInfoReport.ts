import type { Actor } from "@repo/core/domain/common/actor";
import {
  InfoReportId,
  type ListingId,
  type PlaceId,
} from "@repo/core/domain/common/ids";
import { VisibilityPolicy } from "@repo/core/domain/discovery/visibilityPolicy";
import {
  InfoReport,
  type InfoReportInput,
  type InfoReportSubmissionFacts,
} from "@repo/core/domain/moderation/infoReport";
import type { RequestContainer } from "../di/types";
import { ConflictError, UnauthorizedError } from "../errors";
import type { UnitOfWorkContext } from "../execution/unitOfWork";
import type { GeneratedId } from "../ports/idGenerator";
import { placeHasSteward } from "./reads";

export type SubmitInfoReportInput = Readonly<{
  /** Minted by the caller and resent unchanged on failure. */
  reportId: GeneratedId;
  target:
    | Readonly<{ kind: "place"; placeId: PlaceId }>
    | Readonly<{ kind: "listing"; listingId: ListingId }>;
  /** `incorrectInfo` or `closure`; the value object checks it. */
  category: string;
  content: string;
}>;

/** The id holds a report with other content or from someone else. */
export const INFO_REPORT_ID_CONFLICT = "INFO_REPORT_ID_CONFLICT";

/**
 * The facts `InfoReport.submit` needs: the place (a listing's own place)
 * and listing read and judged by `VisibilityPolicy` — missing or
 * unviewable is `unavailable`, and then stewardship is not read.
 */
async function readSubmissionFacts(
  ctx: UnitOfWorkContext,
  target: InfoReportInput["target"],
): Promise<InfoReportSubmissionFacts> {
  const unavailable = { kind: "unavailable" } as const;
  if (target.kind === "place") {
    const place = await ctx.placeRepository.findById(target.placeId);
    if (place === null || !VisibilityPolicy.isPlaceViewable(place.entity)) {
      return unavailable;
    }
    return {
      kind: "available",
      placeId: target.placeId,
      placeHasSteward: await placeHasSteward(ctx, target.placeId),
    };
  }
  const [listing] = await ctx.listingRepository.findByIds([target.listingId]);
  if (listing === undefined) return unavailable;
  const place = await ctx.placeRepository.findById(listing.placeId);
  if (!VisibilityPolicy.isListingViewable(listing, place?.entity ?? null)) {
    return unavailable;
  }
  return {
    kind: "available",
    placeId: listing.placeId,
    placeHasSteward: await placeHasSteward(ctx, listing.placeId),
  };
}

/**
 * A signed-in user reports wrong information or a closure of a stewarded
 * place or one of its listings (`spec/usecases/moderation.md`
 * 「submitInfoReport」; MOD-04 / RQ-08). The report is stored open and
 * `info_report.submitted` tells the operators; the reporter hears nothing
 * back. A listing target records the listing's place. The same user may
 * report the same target again under another id.
 *
 * Idempotent create: the same id from the same reporter with the same
 * target, category and content succeeds without writing or emitting —
 * also after the listing was deleted.
 *
 * - `UnauthorizedError` (`LOGIN_REQUIRED`) without an actor.
 * - `BusinessRuleError`, first failure wins:
 *   `MODERATION_INVALID_INFO_REPORT_CATEGORY`,
 *   `MODERATION_INVALID_INFO_REPORT_CONTENT`,
 *   `MODERATION_INFO_REPORT_TARGET_UNAVAILABLE`,
 *   `MODERATION_INFO_REPORT_PLACE_WITHOUT_STEWARD`.
 * - `ConflictError` (`INFO_REPORT_ID_CONFLICT`) when the id holds another
 *   report; `UNIQUE_VIOLATION` when a concurrent submit of the id commits
 *   first.
 */
export async function submitInfoReport({
  container,
  actor,
  input,
}: Readonly<{
  container: RequestContainer;
  actor: Actor | null;
  input: SubmitInfoReportInput;
}>): Promise<void> {
  if (actor === null) {
    throw new UnauthorizedError("LOGIN_REQUIRED", "Login required");
  }
  const report: InfoReportInput = {
    id: InfoReportId.create(input.reportId),
    target: input.target,
    category: input.category,
    content: input.content,
  };
  const now = container.clock.now();
  await container.unitOfWorkProvider.run(async (ctx) => {
    const existing = await ctx.infoReportRepository.findById(report.id);
    if (existing !== null) {
      if (InfoReport.sameSubmission(existing.entity, report, actor)) return;
      throw new ConflictError(
        INFO_REPORT_ID_CONFLICT,
        "The info report id is already used for another report",
      );
    }
    const facts = await readSubmissionFacts(ctx, report.target);
    const { entity, eventDrafts } = InfoReport.submit(
      report,
      actor,
      facts,
      now,
    );
    await ctx.infoReportRepository.insert(entity);
    ctx.collectEvents(eventDrafts);
  });
}
