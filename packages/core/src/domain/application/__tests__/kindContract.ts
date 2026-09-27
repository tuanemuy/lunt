import type { ApplicationId, PhotoId } from "@repo/core/domain/common/ids";
import type { ContentRef } from "@repo/core/domain/common/refs";
import { BusinessRuleError, isRehydrationError } from "@repo/core/domain/error";
import { describe, expect, it } from "vitest";
import type { ApproverSeat } from "../approverSeat";
import type {
  AnyApplication,
  ApplicationOf,
  ContentName,
  FactsFor,
  KindMap,
  KindName,
  PremiseKeyFor,
  SlotFor,
} from "../kind";
import {
  type Amendment,
  type ApplicationModel,
  type ApplicationSnapshot,
  eraseKinds,
} from "../model";
import { PREMISE_KEYS, type PremiseHolds, type PremiseKey } from "../premise";
import type { UnderReview } from "../status";
import type { ApplicationSubject, SubmissionTarget } from "../subject";
import { RejectionReason, type ReturnReply, ReturnRequest } from "../texts";

/**
 * What one kind must do, as the spec's tables state it for one sample
 * application (`spec/domains/application.md` 「Premise」「SubmissionScope」
 * 「ApproverPolicy」「ApplicationSubject」「SubmissionRequest」「種類ごとの内容」).
 * Several cases may share a kind (an individual's and a steward's
 * affiliation, a companion claim).
 */
export type KindCaseOf<M extends KindMap, K extends KindName<M>> = Readonly<{
  label: string;
  /** A submitted sample, under review. */
  application: UnderReview<ApplicationOf<M, K>>;
  required: readonly PremiseKeyFor<M[K]>[];
  /**
   * Facts and the premises they break, in table order. Include at least
   * one row where every premise holds.
   */
  evaluations: readonly Readonly<{
    facts: FactsFor<M[K]>;
    broken: readonly PremiseKeyFor<M[K]>[];
  }>[];
  seat: ApproverSeat;
  submissionTargets: readonly SubmissionTarget[];
  slot: SlotFor<M[K]> | null;
  subjects: readonly ApplicationSubject[];
  reflectedRef: ContentRef;
  ownedPhotoIds: readonly PhotoId[];
  registrationOf: ApplicationId | null;
  contentNames: readonly ContentName[];
  /** Requests an idempotent resend of `application` may carry. */
  matching: readonly M[K]["request"][];
  /** Requests that differ from `application`. */
  differing: readonly M[K]["request"][];
  /** A valid resubmission of `application` once it is returned. */
  amendment: Amendment<M[K]>;
}>;

export type KindCase<M extends KindMap> = {
  [K in KindName<M>]: KindCaseOf<M, K>;
}[KindName<M>];

type ErasedCase = Readonly<{
  label: string;
  application: AnyApplication;
  required: readonly PremiseKey[];
  evaluations: readonly Readonly<{
    facts: object;
    broken: readonly PremiseKey[];
  }>[];
  seat: ApproverSeat;
  submissionTargets: readonly SubmissionTarget[];
  slot: object | null;
  subjects: readonly ApplicationSubject[];
  reflectedRef: ContentRef;
  ownedPhotoIds: readonly PhotoId[];
  registrationOf: ApplicationId | null;
  contentNames: readonly ContentName[];
  matching: readonly Readonly<{ target: AnyApplication["target"] }>[];
  differing: readonly Readonly<{ target: AnyApplication["target"] }>[];
  amendment: Readonly<{ content: unknown; reply: ReturnReply | null }>;
}>;

const later = (app: AnyApplication, minutes: number): Date =>
  new Date(app.submittedAt.getTime() + minutes * 60_000);

/** The stored form as it crosses JSON (dates as ISO strings) and back. */
function throughJson(snapshot: ApplicationSnapshot): ApplicationSnapshot {
  return JSON.parse(JSON.stringify(snapshot), (key, value) =>
    (key === "since" || key === "submittedAt") && typeof value === "string"
      ? new Date(value)
      : value,
  ) as ApplicationSnapshot;
}

/**
 * The per-kind contract, run over any registry's model: stage 1 runs it on
 * the test-only kinds, and each stage that registers a production kind adds
 * that kind's cases and runs it on `applicationModel`.
 */
export function describeKindContract<M extends KindMap>(
  label: string,
  model: ApplicationModel<M>,
  cases: readonly KindCase<M>[],
): void {
  const m = eraseKinds(model);
  const erased = cases as unknown as readonly ErasedCase[];

  describe(`kind contract: ${label}`, () => {
    describe.each(erased.map((c) => [c.label, c] as const))("%s", (_, c) => {
      const app = c.application;
      const { target } = app;
      const holding = c.evaluations.find((row) => row.broken.length === 0);
      const holds = (): PremiseHolds => {
        if (holding === undefined) throw new Error("No holding evaluation");
        return m.Premise.require(m.Premise.evaluate(target, holding.facts));
      };

      it("lists its premises in the premise table's order", () => {
        expect(m.Premise.required(target)).toEqual(c.required);
        expect(
          [...c.required].sort(
            (a, b) => PREMISE_KEYS.indexOf(a) - PREMISE_KEYS.indexOf(b),
          ),
        ).toEqual(c.required);
      });

      it("evaluates its premises from the facts, and require throws the first broken one's code", () => {
        expect(holding).toBeDefined();
        for (const row of c.evaluations) {
          const result = m.Premise.evaluate(target, row.facts);
          const [first] = row.broken;
          if (first === undefined) {
            expect(result).toEqual({ holds: true });
            continue;
          }
          expect(result).toEqual({ holds: false, broken: row.broken });
          expect(row.broken.every((key) => c.required.includes(key))).toBe(
            true,
          );
          let error: unknown;
          try {
            m.Premise.require(result);
          } catch (caught) {
            error = caught;
          }
          expect(error).toBeInstanceOf(BusinessRuleError);
          expect((error as BusinessRuleError<string>).code).toBe(
            m.Premise.codeOf(first),
          );
        }
      });

      it("seats its approver and names the targets that must be viewable", () => {
        expect(m.ApproverPolicy.seatOf(target)).toEqual(c.seat);
        expect(m.Application.approverSeat(app)).toEqual(c.seat);
        expect(m.SubmissionScope.targets(target)).toEqual(c.submissionTargets);
      });

      it("keys its slot from the target", () => {
        expect(m.ApplicationSlot.of(target)).toEqual(c.slot);
        expect(m.Application.slotOf(app)).toEqual(c.slot);
      });

      it("reports its subjects, reflected ref, owned photos, registration and content names", () => {
        expect(m.Application.subjects(app)).toEqual(c.subjects);
        expect(m.Application.reflectedRef(app)).toEqual(c.reflectedRef);
        expect(m.ApplicationCase.ownedPhotoIds(app)).toEqual(c.ownedPhotoIds);
        expect(m.Application.registrationOf(app)).toEqual(c.registrationOf);
        expect(m.ApplicationCase.contentNames(app)).toEqual(c.contentNames);
      });

      it("matches a resend of the same submission and nothing else", () => {
        for (const request of c.matching) {
          expect(m.Application.matchesSubmission(app, request)).toBe(true);
        }
        for (const request of c.differing) {
          expect(m.Application.matchesSubmission(app, request)).toBe(false);
        }
      });

      it("round-trips through its stored form in every status it can reach", () => {
        const returned = m.Application.sendBack(
          app,
          "approver",
          ReturnRequest.create("確認"),
          later(app, 1),
        ).entity;
        const resubmitted = m.Application.resubmit(
          returned,
          c.amendment,
          holds(),
          later(app, 2),
        ).entity;
        const reason = RejectionReason.create("理由");
        const broken = c.evaluations.find((row) => row.broken.length > 0);
        const states: AnyApplication[] = [
          app,
          returned,
          resubmitted,
          m.Application.approve(app, "approver", holds(), later(app, 3)).entity,
          m.Application.reject(app, "approver", reason, later(app, 3)).entity,
          m.Application.withdraw(returned, later(app, 3)).entity,
        ];
        if (broken !== undefined) {
          states.push(
            m.Application.reassess(
              app,
              m.Premise.evaluate(target, broken.facts),
              later(app, 3),
            ).entity,
          );
        }
        if (c.seat.kind === "steward") {
          states.push(
            m.Application.approve(app, "overdue_proxy", holds(), later(app, 3))
              .entity,
          );
        }
        for (const state of states) {
          expect(
            m.Application.reconstruct(
              throughJson(m.Application.snapshot(state)),
            ),
          ).toEqual(state);
        }
      });

      it("refuses a resubmission carrying a field the kind does not have", () => {
        const returned = m.Application.sendBack(
          app,
          "approver",
          ReturnRequest.create("確認"),
          later(app, 1),
        ).entity;
        const tainted = { ...c.amendment, unexpected: true };
        expect(() =>
          m.Application.resubmit(returned, tainted, holds(), later(app, 2)),
        ).toThrow(/does not have/);
      });

      it("refuses a stored form whose kind is not its case's", () => {
        const other = erased.find(
          (candidate) => candidate.application.target.kind !== target.kind,
        );
        if (other === undefined) return;
        let error: unknown;
        try {
          m.Application.reconstruct({
            ...m.Application.snapshot(app),
            kind: other.application.target.kind,
          });
        } catch (caught) {
          error = caught;
        }
        expect(isRehydrationError(error)).toBe(true);
      });

      it("refuses to lapse on premises it does not have", () => {
        const foreign = erased
          .flatMap((candidate) =>
            candidate.evaluations.map((row) => ({
              target: candidate.application.target,
              row,
            })),
          )
          .find(
            ({ row }) =>
              row.broken.length > 0 &&
              row.broken.some((key) => !c.required.includes(key)),
          );
        if (foreign === undefined) return;
        const result = m.Premise.evaluate(foreign.target, foreign.row.facts);
        expect(() =>
          m.Application.reassess(app, result, later(app, 1)),
        ).toThrow(/are not the premises of this/);
      });
    });
  });
}
