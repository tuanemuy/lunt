import type { LuntStateClient } from "@repo/core/adapters/durableObject/protocol/client";
import type { FakeClock } from "./fakes/fakeClock";
import type { FakeIdGenerator } from "./fakes/fakeIdGenerator";
import type { FakeLogger } from "./fakes/fakeLogger";

/** What each domain's `createTest…Services` receives. */
export type TestServiceDeps = Readonly<{
  client: LuntStateClient;
  clock: FakeClock;
  idGenerator: FakeIdGenerator;
  logger: FakeLogger;
}>;
