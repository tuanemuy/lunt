import type { IdGenerator } from "@repo/core/application/ports/idGenerator";
import type { LuntStateClient } from "../protocol/client";
import type { WriteCommand } from "../protocol/commands";
import type { CommitCondition } from "../protocol/conditions";

export type RepositoryDeps = Readonly<{
  client: LuntStateClient;
  /** The unit of work's write buffer; repositories only append to it. */
  writes: WriteCommand[];
  /** The unit of work's commit conditions; only appended to. */
  conditions: CommitCondition[];
  idGenerator: IdGenerator;
}>;
