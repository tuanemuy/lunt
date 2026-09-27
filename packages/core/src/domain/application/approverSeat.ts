import type { StewardedRef } from "@repo/core/domain/common/refs";

/** The targets whose stewards approve an application: regions and occasions. */
export type SeatTarget = Extract<StewardedRef, { kind: "region" | "occasion" }>;

/**
 * Where an application's approver sits, fixed by its target
 * (`ApplicationTarget`) for the application's whole life: the service
 * operators, or the stewards of a region or occasion. Falling back to the
 * operators while the target has no steward (不在の代行) is not part of the
 * seat — `ApproverPolicy`, `ApplicationReviewDesk` and Notification each
 * decide it from the stewardship facts.
 */
export type ApproverSeat =
  | Readonly<{ kind: "operator" }>
  | Readonly<{ kind: "steward"; target: SeatTarget }>;

export type ApproverSeatKind = ApproverSeat["kind"];

const OPERATOR: ApproverSeat = { kind: "operator" };

export const ApproverSeat = {
  operator: (): ApproverSeat => OPERATOR,
  steward: (target: SeatTarget): ApproverSeat => ({ kind: "steward", target }),
  equals: (a: ApproverSeat, b: ApproverSeat): boolean =>
    a.kind === "operator"
      ? b.kind === "operator"
      : b.kind === "steward" &&
        a.target.kind === b.target.kind &&
        a.target.id === b.target.id,
};
