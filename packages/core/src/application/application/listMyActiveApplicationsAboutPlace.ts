import {
  Application,
  type ApplicationKind,
  type Application as ApplicationValue,
} from "@repo/core/domain/application/application";
import type { ApplicationId, PlaceId } from "@repo/core/domain/common/ids";
import type { Version } from "@repo/core/domain/common/version";
import type { ActorServiceArgs } from "../types";
import {
  type ApplicationStatusView,
  nameSubjects,
  readRegistrations,
  type SubjectView,
} from "./views";

const PAGE_SIZE = 100;

export type ListMyActiveApplicationsAboutPlaceInput = Readonly<{
  placeId: PlaceId;
}>;

/** One active application of the actor's about the place. */
export type MyActiveApplication = Readonly<{
  id: ApplicationId;
  kind: ApplicationKind;
  /**
   * What it is about — the place, a region, a listing … in the kind's
   * order — named by 「申請の対象の名称」 (`nameSubjects`).
   */
  subjects: readonly SubjectView[];
  status: ApplicationStatusView;
  version: Version;
}>;

/**
 * The actor's own active applications (under review or returned) made as
 * an individual about a place — to see what they have already applied
 * for before applying again (REG-03, RQ-05). Others' applications, those
 * made as a steward (`listApplicationsForSubject`) and closed ones are
 * left out. Id order; an unknown place gives none.
 */
export async function listMyActiveApplicationsAboutPlace({
  container,
  actor,
  input,
}: ActorServiceArgs<ListMyActiveApplicationsAboutPlaceInput>): Promise<
  readonly MyActiveApplication[]
> {
  const acting = { kind: "individual", accountId: actor.accountId } as const;
  const read = await container.unitOfWorkProvider.run(async (ctx) => {
    const mine: ApplicationValue[] = [];
    for (let page = 1; ; page += 1) {
      const result = await ctx.applicationRepository.findActiveBySubject(
        { kind: "place", id: input.placeId },
        { page, limit: PAGE_SIZE },
      );
      for (const { entity } of result.items) {
        if (Application.isHandledBy(entity, acting)) mine.push(entity);
      }
      if (result.items.length < PAGE_SIZE) break;
    }
    return { mine, registrations: await readRegistrations(ctx, mine) };
  });
  const subjects = await nameSubjects(
    container.contentDirectory,
    read.mine,
    read.registrations,
  );
  return read.mine.map((entity) => ({
    id: entity.id,
    kind: entity.target.kind,
    subjects: subjects.get(entity.id) ?? [],
    status: entity.status,
    version: entity.version,
  }));
}
