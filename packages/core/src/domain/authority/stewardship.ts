import { EmailAddress } from "@repo/core/domain/common/emailAddress";
import type { WithEventDrafts } from "@repo/core/domain/common/event";
import { AccountId, InvitationId } from "@repo/core/domain/common/ids";
import {
  ContentRef,
  type StewardedKind,
  StewardedRef,
} from "@repo/core/domain/common/refs";
import { Version } from "@repo/core/domain/common/version";
import { BusinessRuleError, RehydrationError } from "@repo/core/domain/error";
import type { TargetStanding } from "./accessPolicy";
import { AuthorityErrorCode } from "./errorCode";
import {
  type AppointmentVia,
  type AuthorityEvent,
  AuthorityEvents,
  type StewardRemovalReason,
} from "./events";

export type Steward = Readonly<{ accountId: AccountId; since: Date }>;

/** A pending invitation; accepted or cancelled ones no longer exist. */
export type Invitation = Readonly<{
  id: InvitationId;
  email: EmailAddress;
  invitedAt: Date;
}>;

type StewardshipBase = Readonly<{
  target: StewardedRef;
  /** Oldest first; no duplicate `id` or `email`. */
  invitations: readonly Invitation[];
  version: Version;
}>;

export type StewardedStewardship = StewardshipBase &
  Readonly<{
    status: "stewarded";
    /** Oldest appointment first; no duplicate `accountId`. */
    stewards: readonly [Steward, ...Steward[]];
  }>;

export type VacantStewardship = StewardshipBase &
  Readonly<{ status: "vacant" }>;

/**
 * One target's stewards and pending invitations (集約。ID は `target`).
 * A target with no stored stewardship reads as `Stewardship.vacant(target)`.
 */
export type Stewardship = StewardedStewardship | VacantStewardship;

/** A stewardship whose target is known to be `T`. */
export type StewardshipOf<T extends StewardedRef> = Stewardship &
  Readonly<{ target: T }>;

type RefOfKind<K extends StewardedKind> = Extract<StewardedRef, { kind: K }>;

/** Regions and occasions: the targets an operator grants stewardship of. */
export type GrantableRef = RefOfKind<"region" | "occasion">;
export type PlaceRef = RefOfKind<"place">;

export type StewardRemoval =
  | Readonly<{ outcome: "removable"; vacates: boolean }>
  | Readonly<{ outcome: "not_a_steward" }>;

export type InviteClassification = "new" | "replay" | "conflict";

export type InvitationStatus =
  | "already_steward"
  | "not_found"
  | "addressed_to_other"
  | "acceptable";

export type Appointee = Readonly<{ accountId: AccountId; email: EmailAddress }>;

type Result<T extends StewardedRef> = WithEventDrafts<
  StewardshipOf<T>,
  AuthorityEvent
>;

function vacant<T extends StewardedRef>(target: T): StewardshipOf<T> {
  return {
    target,
    status: "vacant",
    invitations: [],
    version: Version.initial(),
  };
}

/**
 * The stored stewardship of `target`, or `vacant(target)` when none is
 * stored — narrowed to the caller's target type.
 */
function orVacant<T extends StewardedRef>(
  stored: Stewardship | null,
  target: T,
): StewardshipOf<T> {
  if (stored === null) return vacant(target);
  if (!ContentRef.equals(stored.target, target)) {
    throw new Error(
      `Stewardship of ${ContentRef.key(stored.target)} read for ${ContentRef.key(target)}`,
    );
  }
  return stored as StewardshipOf<T>;
}

const isVacant = (s: Stewardship): s is VacantStewardship =>
  s.status === "vacant";

const stewardsOf = (s: Stewardship): readonly Steward[] =>
  s.status === "stewarded" ? s.stewards : [];

const isSteward = (s: Stewardship, accountId: AccountId): boolean =>
  stewardsOf(s).some((steward) => steward.accountId === accountId);

const findInvitation = (
  s: Stewardship,
  invitationId: InvitationId,
): Invitation | undefined =>
  s.invitations.find((invitation) => invitation.id === invitationId);

/**
 * Whether `accountId` can be removed from the stewards and whether that
 * leaves the target vacant. The only place that decides it: used by
 * `removeSteward` (resignation, revocation, withdrawal) and the
 * withdrawal preview.
 */
function removal(s: Stewardship, accountId: AccountId): StewardRemoval {
  if (!isSteward(s, accountId)) return { outcome: "not_a_steward" };
  return { outcome: "removable", vacates: stewardsOf(s).length === 1 };
}

function standingOf(s: Stewardship, accountId: AccountId): TargetStanding {
  return s.status === "vacant"
    ? { target: s.target, status: "vacant" }
    : {
        target: s.target,
        status: "stewarded",
        actorIsSteward: isSteward(s, accountId),
      };
}

/**
 * Idempotent-create check for an invitation: the same id and email is a
 * replay, the same id with another email a conflict.
 */
function classifyInvite(
  s: Stewardship,
  params: Readonly<{ invitationId: InvitationId; email: EmailAddress }>,
): InviteClassification {
  const existing = findInvitation(s, params.invitationId);
  if (existing === undefined) return "new";
  return existing.email === params.email ? "replay" : "conflict";
}

/**
 * Adds an invitation. `addressee` is the account of `email`, or `null`
 * when there is none — an address without an account can be invited.
 */
function invite<T extends StewardedRef>(
  s: StewardshipOf<T>,
  params: Readonly<{ invitationId: InvitationId; email: EmailAddress }>,
  addressee: AccountId | null,
  now: Date,
): Result<T> {
  if (addressee !== null && isSteward(s, addressee)) {
    throw new BusinessRuleError(
      AuthorityErrorCode.AlreadySteward,
      "The invitee is already a steward of the target",
    );
  }
  if (s.invitations.some((invitation) => invitation.email === params.email)) {
    throw new BusinessRuleError(
      AuthorityErrorCode.InvitationAlreadyPending,
      "A pending invitation to the address already exists",
    );
  }
  if (findInvitation(s, params.invitationId) !== undefined) {
    throw new BusinessRuleError(
      AuthorityErrorCode.InvitationAlreadyPending,
      "An invitation with the id already exists",
    );
  }
  return {
    entity: {
      ...s,
      invitations: [
        ...s.invitations,
        { id: params.invitationId, email: params.email, invitedAt: now },
      ],
      version: Version.next(s.version),
    },
    eventDrafts: [
      AuthorityEvents.invitationIssued(
        s.target,
        params.invitationId,
        params.email,
        now,
      ),
    ],
  };
}

function cancelInvitation<T extends StewardedRef>(
  s: StewardshipOf<T>,
  invitationId: InvitationId,
): Result<T> {
  if (findInvitation(s, invitationId) === undefined) {
    throw new BusinessRuleError(
      AuthorityErrorCode.InvitationNotFound,
      "The invitation does not exist",
    );
  }
  return {
    entity: {
      ...s,
      invitations: s.invitations.filter(
        (invitation) => invitation.id !== invitationId,
      ),
      version: Version.next(s.version),
    },
    eventDrafts: [],
  };
}

/** Judged in this order: already a steward, missing, addressed elsewhere. */
function invitationStatusFor(
  s: Stewardship,
  invitationId: InvitationId,
  viewer: Appointee,
): InvitationStatus {
  if (isSteward(s, viewer.accountId)) return "already_steward";
  const invitation = findInvitation(s, invitationId);
  if (invitation === undefined) return "not_found";
  if (invitation.email !== viewer.email) return "addressed_to_other";
  return "acceptable";
}

function assertNotSteward(s: Stewardship, accountId: AccountId): void {
  if (isSteward(s, accountId)) {
    throw new BusinessRuleError(
      AuthorityErrorCode.AlreadySteward,
      "The account is already a steward of the target",
    );
  }
}

/**
 * Appointment shared by every route: adds the appointee (`since: now`),
 * makes the target stewarded and drops any invitation to the appointee's
 * address — a steward never has a pending invitation.
 */
function appoint<T extends StewardedRef>(
  s: StewardshipOf<T>,
  appointee: Appointee,
  via: AppointmentVia,
  now: Date,
): Result<T> {
  assertNotSteward(s, appointee.accountId);
  const steward: Steward = { accountId: appointee.accountId, since: now };
  const stewards: readonly [Steward, ...Steward[]] =
    s.status === "stewarded" ? [...s.stewards, steward] : [steward];
  return {
    entity: {
      target: s.target,
      status: "stewarded",
      stewards,
      invitations: s.invitations.filter(
        (invitation) => invitation.email !== appointee.email,
      ),
      version: Version.next(s.version),
    },
    eventDrafts: [
      AuthorityEvents.stewardAppointed(s.target, appointee.accountId, via, now),
    ],
  };
}

/** Accepting works on a vacant target too. */
function acceptInvitation<T extends StewardedRef>(
  s: StewardshipOf<T>,
  invitationId: InvitationId,
  acceptor: Appointee,
  now: Date,
): Result<T> {
  switch (invitationStatusFor(s, invitationId, acceptor)) {
    case "already_steward":
      throw new BusinessRuleError(
        AuthorityErrorCode.AlreadySteward,
        "The account is already a steward of the target",
      );
    case "not_found":
      throw new BusinessRuleError(
        AuthorityErrorCode.InvitationNotFound,
        "The invitation does not exist",
      );
    case "addressed_to_other":
      throw new BusinessRuleError(
        AuthorityErrorCode.InvitationEmailMismatch,
        "The invitation is addressed to another email address",
      );
    case "acceptable":
      return appoint(s, acceptor, "invitation", now);
  }
}

/**
 * Appointment by an approved stewardship claim on a place. Application's
 * approving usecase calls it in the same unit of work as the approval.
 */
function appointByApproval<T extends PlaceRef>(
  s: StewardshipOf<T>,
  appointee: Appointee,
  now: Date,
): Result<T> {
  return appoint(s, appointee, "application", now);
}

/** An operator's grant on a region or occasion; places are refused by type. */
function grant<T extends GrantableRef>(
  s: StewardshipOf<T>,
  appointee: Appointee,
  now: Date,
): Result<T> {
  return appoint(s, appointee, "grant", now);
}

/**
 * Removes a steward (resignation, revocation, withdrawal). Removing the
 * last steward leaves the target vacant and also drafts
 * `authority.stewardship_vacated`. Pending invitations stay.
 */
function removeSteward<T extends StewardedRef>(
  s: StewardshipOf<T>,
  accountId: AccountId,
  reason: StewardRemovalReason,
  now: Date,
): Result<T> {
  const verdict = removal(s, accountId);
  if (verdict.outcome === "not_a_steward") {
    throw new BusinessRuleError(
      AuthorityErrorCode.NotASteward,
      "The account is not a steward of the target",
    );
  }
  const removed = AuthorityEvents.stewardRemoved(
    s.target,
    accountId,
    reason,
    now,
  );
  const version = Version.next(s.version);
  if (verdict.vacates) {
    return {
      entity: {
        target: s.target,
        status: "vacant",
        invitations: s.invitations,
        version,
      },
      eventDrafts: [removed, AuthorityEvents.stewardshipVacated(s.target, now)],
    };
  }
  const [first, ...rest] = stewardsOf(s).filter(
    (steward) => steward.accountId !== accountId,
  );
  if (first === undefined) {
    throw new Error("A non-vacating removal must leave a steward");
  }
  return {
    entity: { ...s, status: "stewarded", stewards: [first, ...rest], version },
    eventDrafts: [removed],
  };
}

export type StewardshipSnapshot = Readonly<{
  target: Readonly<{ kind: string; id: string }>;
  status: string;
  stewards: readonly Readonly<{ accountId: string; since: Date }>[];
  invitations: readonly Readonly<{
    id: string;
    email: string;
    invitedAt: Date;
  }>[];
  version: number;
}>;

const distinct = (values: readonly string[]): boolean =>
  new Set(values).size === values.length;

function storedDate(value: Date): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("Invalid stored date");
  return date;
}

function reconstruct(input: StewardshipSnapshot): Stewardship {
  try {
    if (!StewardedRef.isKind(input.target.kind)) {
      throw new Error(`Unknown target kind: ${input.target.kind}`);
    }
    const target = StewardedRef.create(input.target.kind, input.target.id);
    const stewards: Steward[] = input.stewards.map((steward) => ({
      accountId: AccountId.create(steward.accountId),
      since: storedDate(steward.since),
    }));
    const invitations: Invitation[] = input.invitations.map((invitation) => {
      const email = EmailAddress.create(invitation.email);
      if (email !== invitation.email) {
        throw new Error("Stored invitation email is not normalized");
      }
      return {
        id: InvitationId.create(invitation.id),
        email,
        invitedAt: storedDate(invitation.invitedAt),
      };
    });
    if (!distinct(stewards.map((steward) => steward.accountId))) {
      throw new Error("Duplicate steward");
    }
    if (
      !distinct(invitations.map((invitation) => invitation.id)) ||
      !distinct(invitations.map((invitation) => invitation.email))
    ) {
      throw new Error("Duplicate invitation");
    }
    const version = Version.create(input.version);
    const [first, ...rest] = stewards;
    if (input.status === "vacant" && first === undefined) {
      return { target, status: "vacant", invitations, version };
    }
    if (input.status === "stewarded" && first !== undefined) {
      return {
        target,
        status: "stewarded",
        stewards: [first, ...rest],
        invitations,
        version,
      };
    }
    throw new Error(
      `Status ${input.status} does not match ${stewards.length} stewards`,
    );
  } catch (error) {
    throw new RehydrationError("Stored stewardship violates invariants", error);
  }
}

export const Stewardship = {
  vacant,
  orVacant,
  isVacant,
  isSteward,
  stewards: stewardsOf,
  removal,
  standingOf,
  classifyInvite,
  invite,
  cancelInvitation,
  invitationStatusFor,
  acceptInvitation,
  appointByApproval,
  grant,
  removeSteward,
  reconstruct,
};
