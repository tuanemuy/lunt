import type {
  ApplicationKind,
  Application as ApplicationValue,
} from "@repo/core/domain/application/application";
import { APPLICATION_KINDS } from "@repo/core/domain/application/kinds";
import type { SubjectFilter } from "@repo/core/domain/application/ports/applicationRepository";
import { Pagination } from "@repo/core/domain/common/pagination";
import type { StewardedRef } from "@repo/core/domain/common/refs";
import { authorizeOnTarget } from "../authority/access";
import { requireExistingTarget } from "../authority/targets";
import type { ActorServiceArgs } from "../types";
import {
  type ApplicationSummary,
  readSummaryReads,
  summarizeAll,
} from "./views";

export type ListApplicationsForSubjectInput = Readonly<{
  /** The place, region or occasion managed. */
  subject: StewardedRef;
  pagination: Pagination;
}>;

export type ApplicationsForSubject = Readonly<{
  /** Active first, then newest submission, then id. */
  items: readonly ApplicationSummary[];
  count: number;
  /** Regions and occasions: how many are under review (RM-01, EM-01). `null` for a place. */
  underReviewCount: number | null;
}>;

const isRegisteredKind = (kind: string): kind is ApplicationKind =>
  Object.hasOwn(APPLICATION_KINDS, kind);

/** The registered kinds among `names`: the region and occasion kinds join in stage 3. */
const kindsNamed = (names: readonly string[]): readonly ApplicationKind[] =>
  names.filter(isRegisteredKind);

/**
 * What each managed target lists and who may read it: a region its
 * affiliation and leave applications, an occasion its participation
 * applications (their stewards or the absence proxy, `manage_target`); a
 * place the active applications made as its steward (its stewards,
 * `act_as_place` — no absence proxy).
 */
function scopeOf(subject: StewardedRef): Readonly<{
  operation: "manage_target" | "act_as_place";
  filter: SubjectFilter;
}> {
  switch (subject.kind) {
    case "region":
      return {
        operation: "manage_target",
        filter: { kinds: kindsNamed(["affiliation", "leave"]) },
      };
    case "occasion":
      return {
        operation: "manage_target",
        filter: { kinds: kindsNamed(["participation"]) },
      };
    case "place":
      return {
        operation: "act_as_place",
        filter: { applicant: "place", statuses: ["underReview", "returned"] },
      };
  }
}

/**
 * Applications about a managed place, region or occasion (SHP-05,
 * REG-05, REG-08, EVT-01, EVT-07; SM-01, SM-05, SM-06, RM-01, EM-01).
 * Regions and occasions list theirs in any status — an overdue proxy's
 * decision shows as `reviewAs: "overdue_proxy"` — with the number under
 * review; a place lists the active applications made as its steward, for
 * its 「申請中」 relations.
 *
 * - `NotFoundError` (`{PLACE|REGION|OCCASION}_NOT_FOUND`) without the
 *   target, checked before access.
 * - `ForbiddenError` when the actor may not manage the region / occasion,
 *   or act for the place.
 * - `COMMON_INVALID_INPUT` on a bad pagination.
 */
export async function listApplicationsForSubject({
  container,
  actor,
  input,
}: ActorServiceArgs<ListApplicationsForSubjectInput>): Promise<ApplicationsForSubject> {
  const pagination = Pagination.create(input.pagination);
  const { subject } = input;
  const scope = scopeOf(subject);
  await requireExistingTarget(container.stewardedTargetDirectory, subject);
  const read = await container.unitOfWorkProvider.run(async (ctx) => {
    await authorizeOnTarget(ctx, actor, scope.operation, subject);
    const page = await ctx.applicationRepository.findPageBySubject(
      subject,
      scope.filter,
      pagination,
    );
    const underReviewCount =
      subject.kind === "place"
        ? null
        : (
            await ctx.applicationRepository.findPageBySubject(
              subject,
              { ...scope.filter, statuses: ["underReview"] },
              { page: 1, limit: 1 },
            )
          ).count;
    const items: readonly ApplicationValue[] = page.items;
    return {
      items,
      count: page.count,
      underReviewCount,
      reads: await readSummaryReads(ctx, items),
    };
  });
  return {
    items: await summarizeAll(
      container.contentDirectory,
      read.items,
      read.reads,
    ),
    count: read.count,
    underReviewCount: read.underReviewCount,
  };
}
