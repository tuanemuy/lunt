import { SystemError, SystemErrorCode } from "@repo/core/application/errors";
import type {
  ApplicationIn,
  JsonValue,
  KindMap,
} from "@repo/core/domain/application/kind";
import type { ApplicationModel } from "@repo/core/domain/application/model";
import { isRehydrationError } from "@repo/core/domain/error";
import type {
  ApplicationIndexRecord,
  ApplicationRecord,
} from "./protocol/application";

/**
 * Maps applications to and from their at-rest records through a bound
 * model (`createApplicationModel`), so the adapters work for whichever
 * kinds the model was bound to.
 */
export function applicationRecords<M extends KindMap>(
  model: ApplicationModel<M>,
) {
  const { Application, ApplicationSlot } = model;

  function toApplication(record: ApplicationRecord): ApplicationIn<M> {
    try {
      return Application.reconstruct({
        id: record.id,
        kind: record.kind,
        case: JSON.parse(record.case) as JsonValue,
        status: record.status,
        submittedAt: record.submittedAt,
        version: record.version,
      });
    } catch (error) {
      if (isRehydrationError(error) || error instanceof SyntaxError) {
        throw new SystemError(
          SystemErrorCode.DataIntegrityError,
          `Stored application ${record.id} violates invariants`,
          error,
        );
      }
      throw error;
    }
  }

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

  return { toApplication, toRecord, toIndex };
}
