import type { IdGenerator } from "@repo/core/application/ports/idGenerator";
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
import type { Pagination } from "@repo/core/domain/common/pagination";
import type { ScanResult } from "@repo/core/domain/common/scan";
import { applicationRecords } from "./applicationRecords";
import { mapDoError } from "./helpers";
import type { LuntStateClient } from "./protocol/client";
import { restoreScanPage } from "./scan";

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
    idGenerator: Pick<IdGenerator, "parse">,
    model: ApplicationModel<M>,
  ) {
    this.records = applicationRecords(model, idGenerator);
  }

  findPageAwaiting(
    desk: ReviewDesk,
    pagination: Pagination,
  ): Promise<ScanResult<UnderReview<ApplicationIn<M>>>> {
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
        return restoreScanPage(
          page,
          (record) => record.id,
          (record) => this.records.toUnderReview(record),
        );
      },
    );
  }
}
