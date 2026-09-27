import type { EmailAddress } from "@repo/core/domain/common/emailAddress";
import type {
  DomainEventBase,
  EventDraft,
} from "@repo/core/domain/common/event";
import type { AccountId, InvitationId } from "@repo/core/domain/common/ids";
import { ContentRef, type StewardedRef } from "@repo/core/domain/common/refs";
import type { Role } from "./role";

export type AppointmentVia = "invitation" | "application" | "grant";
export type StewardRemovalReason = "resigned" | "revoked" | "withdrawn";
export type RoleRemovalReason = "revoked" | "withdrawn";

export type InvitationIssuedEvent = DomainEventBase<
  "authority.invitation_issued",
  { target: StewardedRef; invitationId: InvitationId; email: EmailAddress }
>;

export type StewardAppointedEvent = DomainEventBase<
  "authority.steward_appointed",
  { target: StewardedRef; accountId: AccountId; via: AppointmentVia }
>;

export type StewardRemovedEvent = DomainEventBase<
  "authority.steward_removed",
  { target: StewardedRef; accountId: AccountId; reason: StewardRemovalReason }
>;

/** Emitted together with `authority.steward_removed` for the last steward. */
export type StewardshipVacatedEvent = DomainEventBase<
  "authority.stewardship_vacated",
  { target: StewardedRef }
>;

/** Not emitted by the first operator's establishment. */
export type RoleGrantedEvent = DomainEventBase<
  "authority.role_granted",
  { role: Role; accountId: AccountId }
>;

export type RoleRevokedEvent = DomainEventBase<
  "authority.role_revoked",
  { role: Role; accountId: AccountId; reason: RoleRemovalReason }
>;

/**
 * Authority's domain events. Consumers read the current stewardship /
 * roster at consumption time rather than trusting the payload: delivery
 * order is not guaranteed.
 */
export type AuthorityEvent =
  | InvitationIssuedEvent
  | StewardAppointedEvent
  | StewardRemovedEvent
  | StewardshipVacatedEvent
  | RoleGrantedEvent
  | RoleRevokedEvent;

export type AuthorityEventType = AuthorityEvent["type"];

// `aggregateId` is `"<kind>:<id>"` for a stewardship and the role for a
// roster (`spec/domains/authority.md` 「ドメインイベント」).
const targetKey = (target: StewardedRef): string => ContentRef.key(target);

export const AuthorityEvents = {
  invitationIssued: (
    target: StewardedRef,
    invitationId: InvitationId,
    email: EmailAddress,
    now: Date,
  ): EventDraft<InvitationIssuedEvent> => ({
    type: "authority.invitation_issued",
    payload: { target, invitationId, email },
    occurredAt: now,
    aggregateId: targetKey(target),
  }),
  stewardAppointed: (
    target: StewardedRef,
    accountId: AccountId,
    via: AppointmentVia,
    now: Date,
  ): EventDraft<StewardAppointedEvent> => ({
    type: "authority.steward_appointed",
    payload: { target, accountId, via },
    occurredAt: now,
    aggregateId: targetKey(target),
  }),
  stewardRemoved: (
    target: StewardedRef,
    accountId: AccountId,
    reason: StewardRemovalReason,
    now: Date,
  ): EventDraft<StewardRemovedEvent> => ({
    type: "authority.steward_removed",
    payload: { target, accountId, reason },
    occurredAt: now,
    aggregateId: targetKey(target),
  }),
  stewardshipVacated: (
    target: StewardedRef,
    now: Date,
  ): EventDraft<StewardshipVacatedEvent> => ({
    type: "authority.stewardship_vacated",
    payload: { target },
    occurredAt: now,
    aggregateId: targetKey(target),
  }),
  roleGranted: (
    role: Role,
    accountId: AccountId,
    now: Date,
  ): EventDraft<RoleGrantedEvent> => ({
    type: "authority.role_granted",
    payload: { role, accountId },
    occurredAt: now,
    aggregateId: role,
  }),
  roleRevoked: (
    role: Role,
    accountId: AccountId,
    reason: RoleRemovalReason,
    now: Date,
  ): EventDraft<RoleRevokedEvent> => ({
    type: "authority.role_revoked",
    payload: { role, accountId, reason },
    occurredAt: now,
    aggregateId: role,
  }),
};
