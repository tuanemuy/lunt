import { BusinessRuleError } from "@repo/core/domain/error";
import { ApplicationErrorCode } from "./errorCode";

declare const claimTextBrand: unique symbol;

export type ClaimText = string & { readonly [claimTextBrand]: true };

/**
 * The content of a stewardship claim: the claimant's relationship to the
 * place, and a contact or material the approver can check it with,
 * written as text. It holds no files.
 */
export type StewardshipClaim = Readonly<{
  relationship: ClaimText;
  evidence: ClaimText;
}>;

/** Trims both; `APPLICATION_INVALID_STEWARDSHIP_CLAIM` when either is empty. */
function create(
  input: Readonly<{ relationship: string; evidence: string }>,
): StewardshipClaim {
  const relationship = input.relationship.trim();
  const evidence = input.evidence.trim();
  if (relationship.length === 0 || evidence.length === 0) {
    throw new BusinessRuleError(
      ApplicationErrorCode.InvalidStewardshipClaim,
      "A stewardship claim needs a relationship and evidence",
    );
  }
  return {
    relationship: relationship as ClaimText,
    evidence: evidence as ClaimText,
  };
}

export const StewardshipClaim = {
  create,
  equals: (a: StewardshipClaim, b: StewardshipClaim): boolean =>
    a.relationship === b.relationship && a.evidence === b.evidence,
};
