import { BusinessRuleError } from "@repo/core/domain/error";
import { ApplicationErrorCode } from "./errorCode";

/**
 * Every premise an application kind can rest on (`spec/scenario/index.md`
 * 「申請の前提」), in the order `Premise.required` lists them — the order of
 * the rows of the premise table.
 */
export const PREMISE_KEYS = [
  "placeHasNoSteward",
  "placeHasSteward",
  "listingExists",
  "notAffiliated",
  "affiliated",
  "occasionOpen",
  "notParticipating",
  "applicantNotSteward",
  "registrationStanding",
] as const;

export type PremiseKey = (typeof PREMISE_KEYS)[number];

declare const premiseHoldsBrand: unique symbol;

/**
 * Proof that every premise held. Only `Premise.evaluate` and
 * `Premise.require` make one, and submitting, resubmitting and approving
 * demand it — none of them can skip the premise check.
 */
export type PremiseHolds = Readonly<{
  holds: true;
  readonly [premiseHoldsBrand]: true;
}>;

export type PremiseBroken<P extends PremiseKey> = Readonly<{
  holds: false;
  /** In `Premise.required` order. */
  broken: readonly [P, ...P[]];
}>;

/** A kind without premises (`P = never`) can only hold. */
export type PremiseResultOf<P extends PremiseKey> = [P] extends [never]
  ? PremiseHolds
  : PremiseHolds | PremiseBroken<P>;

export type PremiseResult = PremiseHolds | PremiseBroken<PremiseKey>;

/**
 * One premise of a kind: `appliesTo` picks the targets it applies to
 * (every target when omitted — e.g. only individual applicants), `holds`
 * judges it from the facts the usecase read. A kind declares at most one
 * rule per key.
 */
export type PremiseRule<T, F, P extends PremiseKey> = Readonly<{
  key: P;
  appliesTo?: (target: T) => boolean;
  holds: (facts: F) => boolean;
}>;

const PREMISE_CODES = {
  placeHasNoSteward: ApplicationErrorCode.PlaceHasSteward,
  placeHasSteward: ApplicationErrorCode.PlaceHasNoSteward,
  listingExists: ApplicationErrorCode.ListingNotFound,
  notAffiliated: ApplicationErrorCode.AlreadyAffiliated,
  affiliated: ApplicationErrorCode.NotAffiliated,
  occasionOpen: ApplicationErrorCode.OccasionNotOpen,
  notParticipating: ApplicationErrorCode.AlreadyParticipating,
  applicantNotSteward: ApplicationErrorCode.AlreadySteward,
  registrationStanding: ApplicationErrorCode.RegistrationNotStanding,
} as const satisfies Readonly<Record<PremiseKey, ApplicationErrorCode>>;

export type PremiseCode = (typeof PREMISE_CODES)[PremiseKey];

const HOLDS = { holds: true } as PremiseHolds;

const rank = (key: PremiseKey): number => PREMISE_KEYS.indexOf(key);

/** The keys of the rules that apply to `target`, in table order. */
function required<T, F, P extends PremiseKey>(
  rules: readonly PremiseRule<T, F, P>[],
  target: T,
): readonly P[] {
  return rules
    .filter((rule) => rule.appliesTo?.(target) ?? true)
    .map((rule) => rule.key)
    .sort((a, b) => rank(a) - rank(b));
}

/** Checks every applying rule; the broken ones in table order. */
function evaluate<T, F, P extends PremiseKey>(
  rules: readonly PremiseRule<T, F, P>[],
  target: T,
  facts: F,
): PremiseResultOf<P> {
  const keys = required(rules, target);
  const broken = keys.filter((key) => {
    const rule = rules.find((candidate) => candidate.key === key);
    return rule !== undefined && !rule.holds(facts);
  });
  const [first, ...rest] = broken;
  if (first === undefined) return HOLDS as PremiseResultOf<P>;
  const brokenResult: PremiseBroken<P> = {
    holds: false,
    broken: [first, ...rest],
  };
  return brokenResult as unknown as PremiseResultOf<P>;
}

/** Throws the first broken premise's code when `result` does not hold. */
function requireHolds(result: PremiseResult): PremiseHolds {
  if (result.holds) return result;
  const [first] = result.broken;
  throw new BusinessRuleError(
    PREMISE_CODES[first],
    `The application's premise ${first} does not hold`,
  );
}

/**
 * The kind-agnostic half of `Premise` (`spec/domains/application.md`
 * 「Premise」): the table order, the code of each premise, and evaluation
 * over a kind's rules. Which rules a kind has lives in its definition; the
 * model (`createApplicationModel`) binds the two into `Premise.required` /
 * `Premise.evaluate` taking a target.
 */
export const PremiseRules = {
  keys: PREMISE_KEYS,
  codeOf: (key: PremiseKey): PremiseCode => PREMISE_CODES[key],
  required,
  evaluate,
  require: requireHolds,
};
