import {
  type ActiveApplication,
  Application,
} from "@repo/core/domain/application/application";
import { ApplicationStatus } from "@repo/core/domain/application/status";
import type { AccountId, ApplicationId } from "@repo/core/domain/common/ids";
import { Pagination } from "@repo/core/domain/common/pagination";
import type { RequestContainer } from "../di/types";
import { defineConsumer } from "../events/consumer";

const PAGE_SIZE = 100;

/** Every active application `accountId` made as an individual, id ascending. */
async function readActive(
  container: RequestContainer,
  accountId: AccountId,
): Promise<readonly ActiveApplication[]> {
  return container.unitOfWorkProvider.run(async ({ applicationRepository }) => {
    const all: ActiveApplication[] = [];
    for (let page = 1; ; page += 1) {
      const result = await applicationRepository.findActiveByIndividual(
        accountId,
        Pagination.create({ page, limit: PAGE_SIZE }),
      );
      all.push(...result.items.map((item) => item.entity));
      if (page * PAGE_SIZE >= result.count || result.items.length === 0) {
        return all;
      }
    }
  });
}

/**
 * The units withdrawn together: an active registration with the claims
 * read that were filed with (refer to) it, and every other application
 * alone.
 */
function unitsOf(
  apps: readonly ActiveApplication[],
): readonly (readonly ApplicationId[])[] {
  const registrations = new Set(
    apps
      .filter((app) => app.target.kind === "registration")
      .map((app) => app.id),
  );
  const companionsOf = new Map<ApplicationId, ApplicationId[]>();
  const alone: ApplicationId[] = [];
  for (const app of apps) {
    const registrationId = Application.registrationOf(app);
    if (registrationId !== null && registrations.has(registrationId)) {
      companionsOf.set(registrationId, [
        ...(companionsOf.get(registrationId) ?? []),
        app.id,
      ]);
    } else if (!registrations.has(app.id)) {
      alone.push(app.id);
    }
  }
  return [
    ...[...registrations].map((id) => [id, ...(companionsOf.get(id) ?? [])]),
    ...alone.map((id) => [id]),
  ];
}

/** Withdraws the unit's applications that are still active, in one unit of work. */
async function withdrawUnit(
  container: RequestContainer,
  ids: readonly ApplicationId[],
): Promise<void> {
  const now = container.clock.now();
  await container.unitOfWorkProvider.run(async (ctx) => {
    for (const id of ids) {
      const found = await ctx.applicationRepository.findById(id);
      if (found === null || !ApplicationStatus.isActive(found.entity.status)) {
        continue;
      }
      const { entity, eventDrafts } = Application.withdraw(
        Application.requireActive(found.entity),
        now,
      );
      await ctx.applicationRepository.save(entity, found.expectedVersion);
      ctx.collectEvents(eventDrafts);
    }
  });
}

/**
 * The `account.withdrawn` consumer (ACC-04, I-01;
 * `spec/usecases/application.md` 「withdrawApplicationsOfWithdrawnAccount」):
 * withdraws every active application the withdrawn person made as an
 * individual, each emitting `application.withdrawn` and keeping its
 * photos. Applications made as a place's steward stay. A registration and
 * the claims filed with it are withdrawn in one unit of work, so the
 * reassessment of the registration's withdrawal finds the claim already
 * withdrawn.
 *
 * Reads every page first (withdrawals do not shift the pages), then one
 * unit of work per unit, re-reading its applications and withdrawing the
 * active ones. Idempotent. A unit that fails (e.g. an approver's decision
 * committed first) does not stop the others; the consumption then fails
 * with the first error, and the redelivery withdraws what is still
 * active.
 */
export async function withdrawApplicationsOf(
  container: RequestContainer,
  accountId: AccountId,
): Promise<void> {
  const units = unitsOf(await readActive(container, accountId));
  const failures: unknown[] = [];
  for (const unit of units) {
    try {
      await withdrawUnit(container, unit);
    } catch (error) {
      container.logger.warn(
        "Withdrawing a withdrawn account's applications failed",
        {
          applicationIds: unit,
          cause: error,
        },
      );
      failures.push(error);
    }
  }
  const [first] = failures;
  if (first !== undefined) throw first;
}

/** The `withdrawApplicationsOfWithdrawnAccount` consumer of `account.withdrawn`. */
export const withdrawApplicationsOfWithdrawnAccount = defineConsumer(
  ["account.withdrawn"],
  (container, event) =>
    withdrawApplicationsOf(container, event.payload.accountId),
);
