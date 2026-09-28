import { Application } from "@repo/core/domain/application/application";
import { ApplicationStatus } from "@repo/core/domain/application/status";
import type { ApplicationSubject } from "@repo/core/domain/application/subject";
import type { ApplicationId } from "@repo/core/domain/common/ids";
import type { RequestContainer } from "../di/types";
import { defineConsumer } from "../events/consumer";
import type { LuntDomainEvent } from "../events/registry";
import type { UnitOfWorkContext } from "../execution/unitOfWork";
import { evaluatePremise } from "./facts";

const PAGE_SIZE = 100;

type PremiseEvent = Extract<
  LuntDomainEvent,
  {
    type:
      | "authority.steward_appointed"
      | "authority.stewardship_vacated"
      | "application.rejected"
      | "application.withdrawn"
      | "listing.deleted";
  }
>;

type ApplicationReader = Pick<UnitOfWorkContext, "applicationRepository">;

/**
 * The applications an event may break premises of: those about its place
 * (a place's stewardship changed), its listing (deleted), or the
 * registration it ended (a companion claim's `registrationStanding`).
 */
async function subjectOf(
  ctx: ApplicationReader,
  event: PremiseEvent,
): Promise<ApplicationSubject | null> {
  switch (event.type) {
    case "authority.steward_appointed":
    case "authority.stewardship_vacated": {
      const { target } = event.payload;
      return target.kind === "place" ? { kind: "place", id: target.id } : null;
    }
    case "listing.deleted":
      return { kind: "listing", id: event.payload.listingId };
    case "application.rejected":
    case "application.withdrawn": {
      const { applicationId } = event.payload;
      const found = await ctx.applicationRepository.findById(applicationId);
      return found?.entity.target.kind === "registration"
        ? { kind: "registration", id: applicationId }
        : null;
    }
  }
}

/** Every active application about `subject`, read to the last page. */
async function activeAbout(
  ctx: ApplicationReader,
  subject: ApplicationSubject,
): Promise<readonly ApplicationId[]> {
  const ids: ApplicationId[] = [];
  for (let page = 1; ; page += 1) {
    const result = await ctx.applicationRepository.findActiveBySubject(
      subject,
      { page, limit: PAGE_SIZE },
    );
    ids.push(...result.items.map(({ entity }) => entity.id));
    if (result.items.length < PAGE_SIZE) return ids;
  }
}

/**
 * The one read-only unit of work before any write: the ended application
 * (for `application.rejected` / `withdrawn`) and every active application
 * about the event's subject, so lapses cannot shift the pages.
 */
function affected(
  container: RequestContainer,
  event: PremiseEvent,
): Promise<readonly ApplicationId[]> {
  return container.unitOfWorkProvider.run(async (ctx) => {
    const subject = await subjectOf(ctx, event);
    return subject === null ? [] : activeAbout(ctx, subject);
  });
}

/**
 * Re-reads one application and its premise facts now; lapses it when a
 * premise broke (`application.lapsed`). A closed application, or one whose
 * premises hold, is not written.
 */
function reassessOne(
  container: RequestContainer,
  id: ApplicationId,
): Promise<void> {
  return container.unitOfWorkProvider.run(async (ctx) => {
    const found = await ctx.applicationRepository.findById(id);
    if (found === null || !ApplicationStatus.isActive(found.entity.status)) {
      return;
    }
    const app = ApplicationStatus.requireActive(found.entity);
    const result = await evaluatePremise(ctx, app.target);
    if (result.holds) return;
    const { entity, eventDrafts } = Application.reassess(
      app,
      result,
      container.clock.now(),
    );
    await ctx.applicationRepository.save(entity, found.expectedVersion);
    ctx.collectEvents(eventDrafts);
  });
}

/**
 * Consumer of the events a premise rests on (P-77, I-02, I-19; APP-05,
 * SHP-03, SHP-10, LST-11, LST-13, LST-16, MEM-03, MEM-04): reads the
 * active applications about the event's place, listing or registration,
 * then re-judges each one on the facts at consumption time in its own
 * unit of work and lapses those whose premises broke. Suspension is no
 * premise. Idempotent and order-free: a lapsed application never
 * returns, and closed ones are not read. One application failing (a
 * reviewer's decision committed first) does not undo the others; the
 * consumption then fails and redelivery handles the rest.
 *
 * Stage 3 subscribes it to the region and occasion events too.
 */
export const reassessApplicationPremises = defineConsumer(
  [
    "authority.steward_appointed",
    "authority.stewardship_vacated",
    "application.rejected",
    "application.withdrawn",
    "listing.deleted",
  ],
  async (container, event) => {
    const ids = await affected(container, event);
    const failures: unknown[] = [];
    for (const id of ids) {
      try {
        await reassessOne(container, id);
      } catch (error) {
        failures.push(error);
      }
    }
    if (failures.length > 0) {
      throw new AggregateError(
        failures,
        `Reassessing ${failures.length} of ${ids.length} applications failed`,
      );
    }
  },
);
