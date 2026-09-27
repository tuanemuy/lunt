import type { EmailAddress } from "@repo/core/domain/common/emailAddress";
import type { TakedownClaimId } from "@repo/core/domain/common/ids";
import type { Origin } from "./announcement";
import type { Occurrence } from "./occurrence";

declare const occurrenceKeyBrand: unique symbol;

/**
 * A non-empty string equal for the same occurrence and different for
 * different ones. With the recipient it keys a notification; with the
 * address it keys a mail.
 */
export type OccurrenceKey = string & { readonly [occurrenceKeyBrand]: true };

/** Identifies one mail: its occurrence and its address. */
export type MailKey = Readonly<{
  occurrenceKey: OccurrenceKey;
  to: EmailAddress;
}>;

const OCCURRENCE_PREFIX = "occurrence";
const TAKEDOWN_OUTCOME_PREFIX = "takedown-outcome";

/**
 * JSON with object keys sorted, so the same value always serializes the
 * same way whatever order its fields were built in.
 */
function canonical(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonical).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

const originPart = (origin: Origin): string =>
  origin.by === "event" ? `event:${origin.eventId}` : `content:${origin.token}`;

/**
 * The key of `occurrence` announced from `origin`: the origin, then the
 * occurrence's fingerprint — its audience, matter kinds, every id (content
 * refs with their kind) and address. Redelivering an event yields the same
 * key; the several occurrences one event makes yield different ones.
 */
function of(origin: Origin, occurrence: Occurrence): OccurrenceKey {
  return `${OCCURRENCE_PREFIX}|${originPart(origin)}|${canonical(occurrence)}` as OccurrenceKey;
}

/** The key of a takedown claim's outcome mail: one per claim. */
function ofTakedownOutcome(claimId: TakedownClaimId): OccurrenceKey {
  return `${TAKEDOWN_OUTCOME_PREFIX}|${claimId}` as OccurrenceKey;
}

/** Rehydrates a stored key; throws on an empty string. */
function create(raw: string): OccurrenceKey {
  if (raw.length === 0) throw new Error("Empty occurrence key");
  return raw as OccurrenceKey;
}

export const OccurrenceKey = { of, ofTakedownOutcome, create };

export const MailKey = {
  equals: (a: MailKey, b: MailKey): boolean =>
    a.occurrenceKey === b.occurrenceKey && a.to === b.to,
  /** A map key unique per mail key. */
  key: (k: MailKey): string => `${k.to} ${k.occurrenceKey}`,
};
