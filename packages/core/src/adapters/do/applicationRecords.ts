import { SystemError, SystemErrorCode } from "@repo/core/application/errors";
import type { IdGenerator } from "@repo/core/application/ports/idGenerator";
import type {
  ApplicationIn,
  JsonValue,
  KindMap,
  SlotIn,
} from "@repo/core/domain/application/kind";
import type { ApplicationModel } from "@repo/core/domain/application/model";
import type { Active, UnderReview } from "@repo/core/domain/application/status";
import type {
  ExpectedVersion,
  Versioned,
} from "@repo/core/domain/common/transactionalRepository";
import type {
  ApplicationIndexRecord,
  ApplicationRecord,
} from "./protocol/application";

const corrupt = (record: ApplicationRecord, why: string, cause?: unknown) =>
  new SystemError(
    SystemErrorCode.DataIntegrityError,
    `Stored application ${record.id} ${why}`,
    cause,
  );

/**
 * Maps applications to and from their at-rest records through a bound
 * model (`createApplicationModel`), so the adapters work for whichever
 * kinds the model was bound to. Every way a stored row can be wrong — a
 * malformed id, invalid JSON, a violated invariant, a status the query
 * promised it would not have — surfaces here as
 * `SystemError(DATA_INTEGRITY_ERROR)`.
 */
export function applicationRecords<M extends KindMap>(
  model: ApplicationModel<M>,
  idGenerator: Pick<IdGenerator, "parse">,
) {
  const { Application, ApplicationSlot } = model;

  function toApplication(record: ApplicationRecord): ApplicationIn<M> {
    if (idGenerator.parse(record.id) === null) {
      throw corrupt(record, "has a malformed id");
    }
    let stored: JsonValue;
    try {
      stored = JSON.parse(record.case) as JsonValue;
    } catch (error) {
      throw corrupt(record, "holds invalid JSON", error);
    }
    try {
      return Application.reconstruct({
        id: record.id,
        kind: record.kind,
        case: stored,
        status: record.status,
        submittedAt: record.submittedAt,
        version: record.version,
      });
    } catch (error) {
      throw corrupt(record, "violates invariants", error);
    }
  }

  /** For reads that select active applications only. */
  function toActive(record: ApplicationRecord): Active<ApplicationIn<M>> {
    const app = toApplication(record);
    try {
      return Application.requireActive(app);
    } catch (error) {
      throw corrupt(record, "was read as active but is not", error);
    }
  }

  /** For reads that select under-review applications only. */
  function toUnderReview(
    record: ApplicationRecord,
  ): UnderReview<ApplicationIn<M>> {
    const app = toApplication(record);
    try {
      return Application.requireUnderReview(app);
    } catch (error) {
      throw corrupt(record, "was read as under review but is not", error);
    }
  }

  /** The version token read with the application (the only place one is minted). */
  const versioned = <A extends ApplicationIn<M>>(
    record: ApplicationRecord,
    entity: A,
  ): Versioned<A> => ({
    entity,
    expectedVersion: record.version as ExpectedVersion<A>,
  });

  function toRecord(app: ApplicationIn<M>): ApplicationRecord {
    const snapshot = Application.snapshot(app);
    return {
      id: snapshot.id,
      kind: snapshot.kind,
      case: JSON.stringify(snapshot.case),
      status: snapshot.status,
      submittedAt: snapshot.submittedAt,
      version: snapshot.version,
    };
  }

  function toIndex(app: ApplicationIn<M>): ApplicationIndexRecord {
    const { applicant } = app.target;
    const slot = Application.slotOf(app);
    const seat = Application.approverSeat(app);
    return {
      applicant:
        applicant.kind === "individual"
          ? { kind: "individual", id: applicant.accountId }
          : { kind: "place", id: applicant.placeId },
      slotKey: slot === null ? null : ApplicationSlot.key(slot),
      seat:
        seat.kind === "operator"
          ? { kind: "operator", id: null }
          : { kind: seat.target.kind, id: seat.target.id },
      subjects: Application.subjects(app).map(({ kind, id }) => ({ kind, id })),
    };
  }

  return {
    slotKey: (slot: SlotIn<M>): string => ApplicationSlot.key(slot),
    toApplication,
    toActive,
    toUnderReview,
    versioned,
    toRecord,
    toIndex,
  };
}
