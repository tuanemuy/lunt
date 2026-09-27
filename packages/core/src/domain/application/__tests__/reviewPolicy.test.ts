import { expectBusinessError } from "@repo/core/domain/common/__tests__/expectBusinessError";
import { describe, expect, it } from "vitest";
import { ReviewPolicy } from "../reviewPolicy";
import type { UnderReviewStatus } from "../status";

const HOUR = 60 * 60 * 1000;
const since = new Date("2026-09-01T00:00:00.000Z");
const underReview = (at: Date): Readonly<{ status: UnderReviewStatus }> => ({
  status: { kind: "underReview", since: at, answering: null },
});

describe("ReviewPolicy.create", () => {
  it("takes a positive integer period", () => {
    expect(ReviewPolicy.create({ proxyAfterMs: 72 * HOUR }).proxyAfterMs).toBe(
      72 * HOUR,
    );
    expect(ReviewPolicy.create({ proxyAfterMs: 1 }).proxyAfterMs).toBe(1);
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "refuses %s",
    (proxyAfterMs) => {
      expectBusinessError(
        () => ReviewPolicy.create({ proxyAfterMs }),
        "APPLICATION_INVALID_REVIEW_POLICY",
      );
    },
  );
});

describe("ReviewPolicy.proxyableAt / overdueCutoff", () => {
  const policy = ReviewPolicy.create({ proxyAfterMs: 72 * HOUR });

  it("counts the period from when the application became under review", () => {
    expect(ReviewPolicy.proxyableAt(underReview(since), policy)).toEqual(
      new Date("2026-09-04T00:00:00.000Z"),
    );
  });

  it("puts the cutoff the period before now", () => {
    expect(
      ReviewPolicy.overdueCutoff(policy, new Date("2026-09-04T00:00:00.000Z")),
    ).toEqual(since);
  });

  it("makes `since <= cutoff` the same judgement as `proxyableAt <= now`", () => {
    for (const offset of [-2, -1, 0, 1, 2, 72 * HOUR]) {
      const now = new Date(since.getTime() + 72 * HOUR + offset);
      const app = underReview(since);
      expect(
        app.status.since.getTime() <=
          ReviewPolicy.overdueCutoff(policy, now).getTime(),
      ).toBe(ReviewPolicy.proxyableAt(app, policy).getTime() <= now.getTime());
    }
  });
});
