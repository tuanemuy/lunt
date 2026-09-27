declare const takedownOutcomeBrand: unique symbol;

/**
 * What the operators did about a takedown claim, or that they took no
 * action (`spec/domains/moderation.md` 「値オブジェクト」): trimmed, 1–2,000
 * characters. Its constructor (`MODERATION_INVALID_TAKEDOWN_OUTCOME`)
 * lands with Moderation's takedown claims in stage 2; Notification's
 * outcome mail only carries the value.
 */
export type TakedownOutcome = string & {
  readonly [takedownOutcomeBrand]: true;
};
