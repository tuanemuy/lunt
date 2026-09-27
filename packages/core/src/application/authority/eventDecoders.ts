import type { AuthorityEvent } from "@repo/core/domain/authority/events";
import { ROLES } from "@repo/core/domain/authority/role";
import { EmailAddress } from "@repo/core/domain/common/emailAddress";
import type { EventDecoder } from "@repo/core/domain/common/event";
import { AccountId, InvitationId } from "@repo/core/domain/common/ids";
import { StewardedRef } from "@repo/core/domain/common/refs";
import { z } from "zod";
import { SystemError, SystemErrorCode } from "../errors";
import { buildEventDecoder } from "../events/buildDecoder";

/** A value that fails its value object is corrupt data, not a user error. */
const intact =
  <P, R>(rehydrate: (parsed: P) => R) =>
  (parsed: P): R => {
    try {
      return rehydrate(parsed);
    } catch (error) {
      throw new SystemError(
        SystemErrorCode.DataIntegrityError,
        "Stored authority event holds an invalid value",
        error,
      );
    }
  };

const targetSchema = z
  .object({ kind: z.enum(StewardedRef.kinds), id: z.string() })
  .strict();

const toTarget = (raw: z.infer<typeof targetSchema>): StewardedRef =>
  StewardedRef.create(raw.kind, raw.id);

const roleSchema = z.enum(ROLES);

type AuthorityEventDecoders = {
  readonly [K in AuthorityEvent["type"]]: EventDecoder<
    Extract<AuthorityEvent, { type: K }>
  >;
};

/** Decoders of Authority's events as stored in the outbox. */
export const authorityEventDecoders: AuthorityEventDecoders = {
  "authority.invitation_issued": buildEventDecoder(
    "authority.invitation_issued",
    z
      .object({
        target: targetSchema,
        invitationId: z.string(),
        email: z.string(),
      })
      .strict(),
    intact((p) => ({
      target: toTarget(p.target),
      invitationId: InvitationId.create(p.invitationId),
      email: EmailAddress.create(p.email),
    })),
  ),
  "authority.steward_appointed": buildEventDecoder(
    "authority.steward_appointed",
    z
      .object({
        target: targetSchema,
        accountId: z.string(),
        via: z.enum(["invitation", "application", "grant"]),
      })
      .strict(),
    intact((p) => ({
      target: toTarget(p.target),
      accountId: AccountId.create(p.accountId),
      via: p.via,
    })),
  ),
  "authority.steward_removed": buildEventDecoder(
    "authority.steward_removed",
    z
      .object({
        target: targetSchema,
        accountId: z.string(),
        reason: z.enum(["resigned", "revoked", "withdrawn"]),
      })
      .strict(),
    intact((p) => ({
      target: toTarget(p.target),
      accountId: AccountId.create(p.accountId),
      reason: p.reason,
    })),
  ),
  "authority.stewardship_vacated": buildEventDecoder(
    "authority.stewardship_vacated",
    z.object({ target: targetSchema }).strict(),
    intact((p) => ({ target: toTarget(p.target) })),
  ),
  "authority.role_granted": buildEventDecoder(
    "authority.role_granted",
    z.object({ role: roleSchema, accountId: z.string() }).strict(),
    intact((p) => ({ role: p.role, accountId: AccountId.create(p.accountId) })),
  ),
  "authority.role_revoked": buildEventDecoder(
    "authority.role_revoked",
    z
      .object({
        role: roleSchema,
        accountId: z.string(),
        reason: z.enum(["revoked", "withdrawn"]),
      })
      .strict(),
    intact((p) => ({
      role: p.role,
      accountId: AccountId.create(p.accountId),
      reason: p.reason,
    })),
  ),
};
