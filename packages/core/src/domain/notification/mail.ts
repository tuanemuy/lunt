import type { ApplicationKind } from "@repo/core/domain/application/application";
import type { EmailAddress } from "@repo/core/domain/common/emailAddress";
import type { ContentRef } from "@repo/core/domain/common/refs";
import type { ResolvedTakedownClaim } from "@repo/core/domain/moderation/takedownClaim";
import type { TakedownOutcome } from "@repo/core/domain/moderation/takedownOutcome";
import type { Origin } from "./announcement";
import type { DeliveredOccurrence } from "./delivery";
import type { NotificationDestination } from "./destination";
import type { OccurrenceRef } from "./occurrence";
import { type MailKey, OccurrenceKey } from "./occurrenceKey";

/** The subjects an application is about, each with its name (`null`: none known). */
export type ApplicationLabel = Readonly<{
  applicationKind: ApplicationKind;
  subjects: readonly Readonly<{
    kind: "place" | "listing" | "region" | "occasion";
    name: string | null;
  }>[];
}>;

/**
 * A reference with the name of what it points at, `null` when that is gone.
 * An application's label is structured; the reader joins it into words.
 */
export type RefLabel =
  | Readonly<{
      ref: Extract<OccurrenceRef, { kind: "application" }>;
      label: ApplicationLabel | null;
    }>
  | Readonly<{
      ref: Exclude<OccurrenceRef, { kind: "application" }>;
      label: string | null;
    }>;

/** The mail of a notification, to one address. */
export type NotificationMail = Readonly<{
  key: MailKey;
  labels: readonly RefLabel[];
}> &
  DeliveredOccurrence;

/** A resolved takedown claim's outcome, mailed to the claimant (no account). */
export type TakedownOutcomeMail = Readonly<{
  key: MailKey;
  target: Readonly<{ ref: ContentRef; label: string | null }>;
  receivedAt: Date;
  outcome: TakedownOutcome;
}>;

/** A mail ready to send. `link` is what the body links to; `null` when nothing. */
export type RenderedMail = Readonly<{
  to: EmailAddress;
  subject: string;
  body: string;
  link: NotificationDestination | null;
}>;

export const NotificationMail = {
  compose: (
    origin: Origin,
    delivered: DeliveredOccurrence,
    to: EmailAddress,
    labels: readonly RefLabel[],
  ): NotificationMail => ({
    key: { occurrenceKey: OccurrenceKey.of(origin, delivered.occurrence), to },
    labels,
    ...delivered,
  }),
};

const takedownOutcomeKey = (claim: ResolvedTakedownClaim): MailKey => ({
  occurrenceKey: OccurrenceKey.ofTakedownOutcome(claim.id),
  to: claim.email,
});

export const TakedownOutcomeMail = {
  /** The outcome mail's key: one mail per claim, to the claim's address. */
  keyOf: takedownOutcomeKey,

  /**
   * The outcome mail of a resolved claim, to its address; `targetLabel`
   * is the name of the claim's target (`null`: none).
   */
  compose: (
    claim: ResolvedTakedownClaim,
    targetLabel: string | null,
  ): TakedownOutcomeMail => ({
    key: takedownOutcomeKey(claim),
    target: { ref: claim.ground.target, label: targetLabel },
    receivedAt: claim.receivedAt,
    outcome: claim.outcome,
  }),
};
