import { NotFoundError } from "@repo/core/application/errors";
import type { UnitOfWorkContext } from "@repo/core/application/execution/unitOfWork";
import type { IdGenerator } from "@repo/core/application/ports/idGenerator";
import {
  type ApplicationIds,
  approved,
  lapsed,
  rejected,
  resubmitted,
  returned,
  type TestApplication,
  withdrawn,
} from "@repo/core/domain/application/__tests__/fixtures";
import {
  type TestKindMap,
  TestModel,
} from "@repo/core/domain/application/__tests__/testKinds";
import type { ApplicationRepository } from "@repo/core/domain/application/ports/applicationRepository";
import type { ApplicationReviewDesk } from "@repo/core/domain/application/ports/applicationReviewDesk";
import type { PremiseKey } from "@repo/core/domain/application/premise";
import type { ReviewAs } from "@repo/core/domain/application/status";
import {
  type Appointee,
  Stewardship,
  type StewardshipOf,
} from "@repo/core/domain/authority/stewardship";
import { EmailAddress } from "@repo/core/domain/common/emailAddress";
import type {
  AccountId,
  ApplicationId,
  OccasionId,
  RegionId,
} from "@repo/core/domain/common/ids";
import type { Pagination } from "@repo/core/domain/common/pagination";
import type {
  ExpectedVersion,
  Versioned,
} from "@repo/core/domain/common/transactionalRepository";
import { DoApplicationReviewDesk } from "../applicationReviewDesk";
import type { LuntStateClient } from "../protocol/client";
import { DoApplicationRepository } from "../repositories/applicationRepository";
import { createRepositories } from "../repositories/index";
import { DoUnitOfWorkProvider } from "../unitOfWork";
import type { SavedEvent } from "./harness";

/**
 * The unit-of-work context the Application suites use: the real one, with
 * `applicationRepository` bound to the test-only kinds
 * (`domain/application/__tests__/testKinds.ts`) — stage 1 registers no
 * production kind. The repository is the same object over the same
 * buffer, so it commits and rolls back with the rest of the scope.
 */
export type ApplicationContext = Omit<
  UnitOfWorkContext,
  "applicationRepository"
> &
  Readonly<{ applicationRepository: ApplicationRepository<TestKindMap> }>;

export type ApplicationHarness = Readonly<{
  run<T>(fn: (ctx: ApplicationContext) => Promise<T>): Promise<T>;
  reviewDesk: ApplicationReviewDesk<TestKindMap>;
  savedEvents(): Promise<readonly SavedEvent[]>;
}>;

export type ApplicationHarnessFactory = () => Promise<ApplicationHarness>;

/**
 * Binds a backend's state client to the test-only kinds: each `run` is the
 * real unit of work (`DoUnitOfWorkProvider`) whose repository factory
 * builds the application repository over the test model, on the same
 * buffer as every other repository of the scope.
 */
export function applicationHarness(
  client: LuntStateClient,
  idGenerator: IdGenerator,
  savedEvents: () => Promise<readonly SavedEvent[]>,
): ApplicationHarness {
  return {
    run: (fn) => {
      let applicationRepository: ApplicationRepository<TestKindMap> | null =
        null;
      const uow = new DoUnitOfWorkProvider(client, idGenerator, (deps) => {
        applicationRepository = new DoApplicationRepository<TestKindMap>(
          deps,
          TestModel,
        );
        return createRepositories(deps);
      });
      return uow.run((ctx) => {
        if (applicationRepository === null) {
          throw new Error("The unit of work built no repositories");
        }
        return fn({ ...ctx, applicationRepository });
      });
    },
    reviewDesk: new DoApplicationReviewDesk<TestKindMap>(
      client,
      idGenerator,
      TestModel,
    ),
    savedEvents,
  };
}

export const ALL: Pagination = { page: 1, limit: 100 };

export async function insertApplications(
  h: ApplicationHarness,
  ...apps: readonly TestApplication[]
): Promise<void> {
  await h.run(async ({ applicationRepository }) => {
    for (const app of apps) await applicationRepository.insert(app);
  });
}

export function findApplication(
  h: ApplicationHarness,
  id: ApplicationId,
): Promise<Versioned<TestApplication> | null> {
  return h.run(({ applicationRepository }) =>
    applicationRepository.findById(id),
  );
}

export async function getApplication(
  h: ApplicationHarness,
  id: ApplicationId,
): Promise<Versioned<TestApplication>> {
  const found = await findApplication(h, id);
  if (found === null) throw new NotFoundError("TEST", `no application ${id}`);
  return found;
}

export function saveApplication(
  h: ApplicationHarness,
  app: TestApplication,
  expectedVersion: ExpectedVersion<TestApplication>,
): Promise<void> {
  return h.run(({ applicationRepository }) =>
    applicationRepository.save(app, expectedVersion),
  );
}

/**
 * Inserts `app`, then reads and saves each step of it in turn — a state
 * reached through the lifecycle and the port's `save`, as the suites'
 * premises are built. Returns the last state saved.
 */
export async function storeThrough(
  h: ApplicationHarness,
  app: TestApplication,
  ...steps: readonly ((current: TestApplication) => TestApplication)[]
): Promise<TestApplication> {
  await insertApplications(h, app);
  let current: TestApplication = app;
  for (const step of steps) {
    const read = await getApplication(h, current.id);
    current = step(read.entity);
    await saveApplication(h, current, read.expectedVersion);
  }
  return current;
}

const { Application } = TestModel;

type Step = (current: TestApplication) => TestApplication;

/** Lifecycle steps for `storeThrough`, each through the status guard. */
export const steps = {
  returned:
    (at: Date): Step =>
    (app) =>
      returned(Application.requireUnderReview(app), at),
  resubmitted:
    (at: Date): Step =>
    (app) =>
      resubmitted(Application.requireReturned(app), at),
  approved:
    (at: Date, as: ReviewAs = "approver"): Step =>
    (app) =>
      approved(Application.requireUnderReview(app), at, as),
  rejected:
    (at: Date, as: ReviewAs = "approver"): Step =>
    (app) =>
      rejected(Application.requireUnderReview(app), at, as),
  withdrawn:
    (at: Date): Step =>
    (app) =>
      withdrawn(Application.requireActive(app), at),
  lapsed:
    (at: Date, broken?: readonly [PremiseKey, ...PremiseKey[]]): Step =>
    (app) =>
      lapsed(Application.requireActive(app), at, broken),
};

/**
 * `n` application ids in an order that is neither ascending nor
 * descending (reversed, the first two swapped; just reversed for n < 3).
 * Given to applications submitted in turn, they keep id order, submission
 * order and insertion order apart, so a suite notices a dropped sort key.
 */
export function scrambledIds(
  ids: ApplicationIds,
  n: number,
): readonly ApplicationId[] {
  const reversed = Array.from({ length: n }, () => ids.application()).reverse();
  return n < 3
    ? reversed
    : [...reversed.slice(1, 2), ...reversed.slice(0, 1), ...reversed.slice(2)];
}

/** In id order (code point order, as the ports sort ties). */
export const inIdOrder = <T extends { id: ApplicationId }>(
  apps: readonly T[],
): readonly T[] => [...apps].sort((x, y) => (x.id < y.id ? -1 : 1));

export const idsOf = (apps: readonly { id: ApplicationId }[]) =>
  apps.map((app) => app.id);

export const sortedIds = (apps: readonly { id: ApplicationId }[]) =>
  [...idsOf(apps)].sort();

export const entities = <T>(items: readonly Versioned<T>[]) =>
  items.map((item) => item.entity);

type SeatRef =
  | Readonly<{ kind: "region"; id: RegionId }>
  | Readonly<{ kind: "occasion"; id: OccasionId }>;

let appointees = 0;

/** A fresh appointee for a stewardship. */
export function appointee(accountId: AccountId): Appointee {
  appointees += 1;
  return {
    accountId,
    email: EmailAddress.create(`steward${appointees}@example.com`),
  };
}

/** A region / occasion stewardship with one steward. */
export function stewarded<T extends SeatRef>(
  target: T,
  who: Appointee,
  now: Date,
): StewardshipOf<T> {
  return Stewardship.grant(Stewardship.vacant(target), who, now)
    .entity as StewardshipOf<T>;
}

/** A stored-but-vacant stewardship: its last steward resigned. */
export function vacated<T extends SeatRef>(
  target: T,
  who: Appointee,
  now: Date,
): StewardshipOf<T> {
  return Stewardship.removeSteward(
    stewarded(target, who, now),
    who.accountId,
    "resigned",
    now,
  ).entity;
}

export async function insertStewardshipsOf(
  h: ApplicationHarness,
  ...stewardships: readonly Stewardship[]
): Promise<void> {
  await h.run(async ({ stewardshipRepository }) => {
    for (const s of stewardships) await stewardshipRepository.insert(s);
  });
}
