import {
  applicationHarness,
  insertApplications,
} from "@repo/core/adapters/durableObject/__conformance__/applicationFixtures";
import { DoApplicationReviewDesk } from "@repo/core/adapters/durableObject/applicationReviewDesk";
import { createInProcessState } from "@repo/core/adapters/durableObject/testing/inProcessState";
import { DoUnitOfWorkProvider } from "@repo/core/adapters/durableObject/unitOfWork";
import { SystemError } from "@repo/core/application/errors";
import {
  applicationIds,
  submitted,
  targets,
} from "@repo/core/domain/application/__tests__/fixtures";
import { applicationModel } from "@repo/core/domain/application/application";
import {
  APPLICATION_KINDS,
  type ApplicationKindMap,
} from "@repo/core/domain/application/kinds";
import { describe, expect, it } from "vitest";
import { FakeClock } from "../../__tests__/fakes/fakeClock";
import { FakeIdGenerator } from "../../__tests__/fakes/fakeIdGenerator";
import { createTestContainer } from "../../__tests__/testContainer";
import {
  DEFAULT_APPLICATION_PROXY_AFTER_MS,
  readReviewPolicy,
} from "../../di/application";

describe("Application wiring", () => {
  it("registers all eight kinds; the ports start empty", async () => {
    expect(Object.keys(APPLICATION_KINDS).sort()).toEqual([
      "affiliation",
      "leave",
      "listing",
      "listingRevision",
      "participation",
      "registration",
      "revision",
      "stewardship",
    ]);
    const { container } = createTestContainer();
    const ids = applicationIds();
    const id = ids.application();
    expect(
      await container.unitOfWorkProvider.run(({ applicationRepository }) =>
        applicationRepository.findById(id),
      ),
    ).toBeNull();
    expect(
      await container.unitOfWorkProvider.run(({ overdueNoticeLedger }) =>
        overdueNoticeLedger.findByApplicationIds([id]),
      ),
    ).toEqual([]);
    expect(
      await container.applicationReviewDesk.findPageAwaiting(
        { section: "asApprover" },
        { page: 1, limit: 10 },
      ),
    ).toEqual({ items: [], count: 0, unreadable: [] });
  });

  it("refuses to read an application of an unregistered kind as corrupt data", async () => {
    const idGenerator = new FakeIdGenerator();
    const state = createInProcessState({ clock: new FakeClock(), idGenerator });
    const ids = applicationIds();
    const app = submitted(ids, targets.revision(ids.account(), ids.place()));
    // Stored through the test-only kinds, read through the production ones.
    await insertApplications(
      applicationHarness(state.client, idGenerator, async () => []),
      app,
    );
    const production = new DoUnitOfWorkProvider(state.client, idGenerator);
    const corrupt = { code: "DATA_INTEGRITY_ERROR" };
    await expect(
      production.run(({ applicationRepository }) =>
        applicationRepository.findById(app.id),
      ),
    ).rejects.toMatchObject(corrupt);
    await expect(
      production.run(({ applicationRepository }) =>
        applicationRepository.findByIds([app.id]),
      ),
    ).rejects.toBeInstanceOf(SystemError);
    // The daily jobs' scan reports it by id instead of failing the page.
    expect(
      await new DoApplicationReviewDesk<ApplicationKindMap>(
        state.client,
        idGenerator,
        applicationModel,
      ).findPageAwaiting({ section: "asApprover" }, { page: 1, limit: 10 }),
    ).toMatchObject({
      items: [],
      count: 1,
      unreadable: [{ key: app.id, cause: corrupt }],
    });
  });
});

describe("readReviewPolicy", () => {
  it("defaults the review period and reads an override", () => {
    expect(readReviewPolicy({}).proxyAfterMs).toBe(
      DEFAULT_APPLICATION_PROXY_AFTER_MS,
    );
    expect(
      readReviewPolicy({ APPLICATION_PROXY_AFTER_MS: "3600000" }).proxyAfterMs,
    ).toBe(3_600_000);
  });

  it("refuses a period that is not a positive integer", () => {
    for (const raw of ["0", "-1", "1.5", "soon"]) {
      expect(() =>
        readReviewPolicy({ APPLICATION_PROXY_AFTER_MS: raw }),
      ).toThrow();
    }
  });
});
