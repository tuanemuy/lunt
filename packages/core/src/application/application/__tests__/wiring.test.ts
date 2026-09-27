import { DoApplicationRepository } from "@repo/core/adapters/do/repositories/applicationRepository";
import { SystemError } from "@repo/core/application/errors";
import {
  applicationIds,
  submitted,
  targets,
} from "@repo/core/domain/application/__tests__/fixtures";
import { TestModel } from "@repo/core/domain/application/__tests__/testKinds";
import { APPLICATION_KINDS } from "@repo/core/domain/application/kinds";
import { describe, expect, it } from "vitest";
import { createTestContainer } from "../../__tests__/testContainer";
import {
  DEFAULT_APPLICATION_PROXY_AFTER_MS,
  readReviewPolicy,
} from "../../di/application";

describe("Application wiring in stage 1", () => {
  it("registers no production kind: the ports run and hold nothing", async () => {
    expect(APPLICATION_KINDS).toEqual({});
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
    ).toEqual({ items: [], count: 0 });
  });

  it("refuses to read an application of an unregistered kind as corrupt data", async () => {
    const { container } = createTestContainer();
    const ids = applicationIds();
    const app = submitted(ids, targets.revision(ids.account(), ids.place()));
    await container.unitOfWorkProvider.run(
      async ({ applicationRepository }) => {
        if (!(applicationRepository instanceof DoApplicationRepository)) {
          throw new Error("expected the DO repository");
        }
        await applicationRepository.withModel(TestModel).insert(app);
      },
    );
    const corrupt = { code: "DATA_INTEGRITY_ERROR" };
    await expect(
      container.unitOfWorkProvider.run(({ applicationRepository }) =>
        applicationRepository.findById(app.id),
      ),
    ).rejects.toMatchObject(corrupt);
    await expect(
      container.unitOfWorkProvider.run(({ applicationRepository }) =>
        applicationRepository.findByIds([app.id]),
      ),
    ).rejects.toBeInstanceOf(SystemError);
    await expect(
      container.applicationReviewDesk.findPageAwaiting(
        { section: "asApprover" },
        { page: 1, limit: 10 },
      ),
    ).rejects.toMatchObject(corrupt);
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
