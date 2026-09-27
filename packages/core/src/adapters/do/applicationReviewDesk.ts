import type {
  ApplicationIn,
  KindMap,
} from "@repo/core/domain/application/kind";
import type { ApplicationModel } from "@repo/core/domain/application/model";
import type {
  ApplicationReviewDesk,
  ReviewDesk,
} from "@repo/core/domain/application/ports/applicationReviewDesk";
import type { UnderReview } from "@repo/core/domain/application/status";
import type {
  Pagination,
  PaginationResult,
} from "@repo/core/domain/common/pagination";
import { applicationRecords } from "./applicationRecords";
import { mapDoError } from "./helpers";
import type { LuntStateClient } from "./protocol/client";

/**
 * `ApplicationReviewDesk` over the Lunt state object: one read joining the
 * applications' seats with Authority's stewardships. Read-only; it never
 * joins a unit of work.
 */
export class DoApplicationReviewDesk<M extends KindMap>
  implements ApplicationReviewDesk<M>
{
  private readonly records: ReturnType<typeof applicationRecords<M>>;

  constructor(
    private readonly client: Pick<LuntStateClient, "query">,
    private readonly model: ApplicationModel<M>,
  ) {
    this.records = applicationRecords(model);
  }

  findPageAwaiting(
    desk: ReviewDesk,
    pagination: Pagination,
  ): Promise<PaginationResult<UnderReview<ApplicationIn<M>>>> {
    return mapDoError(
      "Failed to list applications awaiting review",
      async () => {
        const page = await this.client.query("application.findPageAwaiting", {
          desk:
            desk.section === "asApprover"
              ? { section: "asApprover" }
              : {
                  section: "asOverdueProxy",
                  pendingSinceBefore: desk.pendingSinceBefore,
                },
          page: pagination.page,
          limit: pagination.limit,
        });
        return {
          items: page.items.map((record) =>
            this.model.Application.requireUnderReview(
              this.records.toApplication(record),
            ),
          ),
          count: page.count,
        };
      },
    );
  }
}
