const WHITESPACE = /\s/gu;

/**
 * The one normalisation every keyword / name / address comparison uses, so
 * match results do not depend on the storage backend.
 */
export const TextNormalization = {
  /**
   * NFKC → locale-independent default lowercasing (`toLowerCase`, which also
   * folds non-ASCII letters) → removal of every whitespace character
   * (full-width included), in that order.
   */
  normalize: (input: string): string =>
    input.normalize("NFKC").toLowerCase().replace(WHITESPACE, ""),

  /**
   * Length in Unicode code points. Length limits in the spec count
   * characters, and UTF-16 `length` would count an emoji / surrogate pair
   * twice.
   */
  characterCount: (input: string): number => {
    let count = 0;
    for (const _ of input) count += 1;
    return count;
  },
};
