import { Stewardship } from "@repo/core/domain/authority/stewardship";
import type { OccasionStanding } from "./standing";

/**
 * The range of candidates an in-form selection offers, set by the calling
 * operation's scenario (`spec/domains/discovery.md` 「SelectionScope」).
 * Targets outside it never appear and are not counted; targets the calling
 * operation would refuse inside it still appear.
 */
export type SelectionScope =
  | Readonly<{ kind: "place"; vacantOnly: boolean }>
  | Readonly<{ kind: "listing" }>
  | Readonly<{ kind: "region" }>
  | Readonly<{ kind: "occasion"; openOnly: boolean }>;

export type SelectionKind = SelectionScope["kind"];

export const SelectionScope = {
  kinds: [
    "place",
    "listing",
    "region",
    "occasion",
  ] as const satisfies readonly SelectionKind[],
  /**
   * Every place unless `vacantOnly`; then only places without a steward
   * (no stored stewardship counts as `Stewardship.vacant`).
   */
  admitsPlace: (vacantOnly: boolean, stewardship: Stewardship): boolean =>
    !vacantOnly || Stewardship.isVacant(stewardship),
  /** Every occasion unless `openOnly`; then upcoming and ongoing ones only. */
  admitsOccasion: (openOnly: boolean, standing: OccasionStanding): boolean =>
    !openOnly ||
    standing.holding === "upcoming" ||
    standing.holding === "ongoing",
};
