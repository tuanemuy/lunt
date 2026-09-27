import { describe, expect, it } from "vitest";
import { ReviewPolicy } from "../reviewPolicy";
import {
  applicationIds,
  approved,
  resubmitted,
  returned,
  submitted,
  targets,
} from "./fixtures";
import { TestModel } from "./testKinds";

const { OverdueReviewWatch } = TestModel;

const HOUR = 60 * 60 * 1000;
const policy = ReviewPolicy.create({ proxyAfterMs: 24 * HOUR });

describe("OverdueReviewWatch.detect", () => {
  const ids = applicationIds();
  const since = ids.tick();
  const app = submitted(
    ids,
    targets.participation(ids.place(), ids.occasion()),
    since,
  );
  const due = new Date(since.getTime() + 24 * HOUR);

  it("records the spell and drafts the notice once the period elapsed", () => {
    expect(OverdueReviewWatch.detect(app, null, policy, due)).toEqual({
      notice: { applicationId: app.id, pendingSince: since },
      eventDrafts: [
        {
          type: "application.review_period_elapsed",
          payload: { applicationId: app.id, pendingSince: since },
          occurredAt: due,
          aggregateId: app.id,
        },
      ],
    });
  });

  it("waits until the period elapses", () => {
    expect(
      OverdueReviewWatch.detect(app, null, policy, new Date(due.getTime() - 1)),
    ).toBeNull();
  });

  it("notifies a spell once", () => {
    expect(
      OverdueReviewWatch.detect(
        app,
        { applicationId: app.id, pendingSince: since },
        policy,
        new Date(due.getTime() + 48 * HOUR),
      ),
    ).toBeNull();
  });

  it("notifies again after a resubmission restarts the spell", () => {
    const again = resubmitted(returned(app, ids.tick()), ids.tick());
    const later = new Date(again.status.since.getTime() + 24 * HOUR);
    expect(
      OverdueReviewWatch.detect(
        again,
        { applicationId: app.id, pendingSince: since },
        policy,
        later,
      )?.notice,
    ).toEqual({ applicationId: app.id, pendingSince: again.status.since });
  });

  it("ignores operator-seat kinds and applications not under review", () => {
    const revision = submitted(
      ids,
      targets.revision(ids.account(), ids.place()),
      since,
    );
    expect(OverdueReviewWatch.detect(revision, null, policy, due)).toBeNull();
    expect(
      OverdueReviewWatch.detect(returned(app, ids.tick()), null, policy, due),
    ).toBeNull();
    expect(
      OverdueReviewWatch.detect(approved(app, ids.tick()), null, policy, due),
    ).toBeNull();
  });
});
