import { createInProcessState } from "@repo/core/adapters/do/testing/inProcessState";
import { DoUnitOfWorkProvider } from "@repo/core/adapters/do/unitOfWork";
import { createTestAccountServices } from "../account/__tests__/testServices";
import { createTestApplicationServices } from "../application/__tests__/testServices";
import { createTestAreaServices } from "../area/__tests__/testServices";
import { createTestAuthorityServices } from "../authority/__tests__/testServices";
import type { RequestContainer } from "../di/types";
import { createTestDiscoveryServices } from "../discovery/__tests__/testServices";
import type { EventDecoderRegistry } from "../events/registry";
import { createTestListingServices } from "../listing/__tests__/testServices";
import { createTestMediaServices } from "../media/__tests__/testServices";
import { createTestModerationServices } from "../moderation/__tests__/testServices";
import { createTestNotificationServices } from "../notification/__tests__/testServices";
import { createTestPlaceServices } from "../place/__tests__/testServices";
import { FakeClock } from "./fakes/fakeClock";
import { FakeIdGenerator } from "./fakes/fakeIdGenerator";
import { FakeLogger } from "./fakes/fakeLogger";
import type { TestServiceDeps } from "./testServiceDeps";

const FAR_FUTURE = new Date("9999-01-01T00:00:00.000Z");

export type StoredEvent = Readonly<{
  type: string;
  aggregateId: string;
  payload: unknown;
  occurredAt: Date;
}>;

export type TestContext = Readonly<{
  container: RequestContainer;
  clock: FakeClock;
  idGenerator: FakeIdGenerator;
  logger: FakeLogger;
  /** Every domain event the outbox holds, in insertion order. */
  storedEvents(): Promise<readonly StoredEvent[]>;
}>;

export type TestContainerOptions = Readonly<{
  start?: Date | string;
  /** Replace any container member (e.g. a fake an individual test drives). */
  overrides?: (deps: TestServiceDeps) => Partial<RequestContainer>;
  decoders?: EventDecoderRegistry;
}>;

/**
 * A production-shaped container for usecase tests (design.md D-11): the
 * real unit of work and repositories over the state object's store code
 * on an in-memory `node:sqlite` database, a clock the test moves, a
 * deterministic id generator, and each domain's test services (fakes only
 * for external IO).
 */
export function createTestContainer(
  options: TestContainerOptions = {},
): TestContext {
  const clock = new FakeClock(options.start);
  const idGenerator = new FakeIdGenerator();
  const logger = new FakeLogger();
  const state = createInProcessState({
    clock,
    idGenerator,
    ...(options.decoders === undefined ? {} : { decoders: options.decoders }),
  });
  const deps: TestServiceDeps = {
    client: state.client,
    clock,
    idGenerator,
    logger,
  };
  const container: RequestContainer = {
    clock,
    idGenerator,
    logger,
    config: {
      appUrl: "http://localhost:3000",
      siteName: "Lunt",
      defaultTitle: "Lunt",
      defaultDescription: "",
      themeColor: "#ffffff",
    },
    runtime: {
      devTools: true,
      sessionSecret: "test-session-secret-long-enough-000000",
      opsToken: null,
    },
    unitOfWorkProvider: new DoUnitOfWorkProvider(state.client, idGenerator),
    ...createTestAccountServices(deps),
    ...createTestAuthorityServices(deps),
    ...createTestApplicationServices(deps),
    ...createTestNotificationServices(deps),
    ...createTestModerationServices(deps),
    devClock: {
      offsetMs: () => state.client.devClockOffset(),
      advance: async (ms) => {
        const outcome = await state.client.devAdvanceClock(ms);
        if (outcome.kind === "refused") throw new Error(outcome.reason);
        return outcome.offsetMs;
      },
    },
    ...createTestAreaServices(deps),
    ...createTestMediaServices(deps),
    ...createTestPlaceServices(deps),
    ...createTestListingServices(deps),
    ...createTestDiscoveryServices(deps),
    ...(options.overrides?.(deps) ?? {}),
  };
  return {
    container,
    clock,
    idGenerator,
    logger,
    storedEvents: async () =>
      (
        await state.outboxRepository.claimPending({
          limit: 10_000,
          now: FAR_FUTURE,
          workerId: "test",
          leaseMs: 0,
        })
      ).map((entry) => ({
        type: entry.type,
        aggregateId: entry.aggregateId,
        payload: entry.payload,
        occurredAt: entry.occurredAt,
      })),
  };
}
