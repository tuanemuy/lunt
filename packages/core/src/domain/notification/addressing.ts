import type { Role } from "@repo/core/domain/authority/role";
import {
  type EditorRoster,
  type OperatorRoster,
  RoleRoster,
} from "@repo/core/domain/authority/roleRoster";
import { Stewardship } from "@repo/core/domain/authority/stewardship";
import type { EmailAddress } from "@repo/core/domain/common/emailAddress";
import type { AccountId } from "@repo/core/domain/common/ids";
import type { StewardedRef } from "@repo/core/domain/common/refs";
import { Announcement } from "./announcement";
import type { DeliveredOccurrence } from "./delivery";
import {
  type DirectAudienceOccurrence,
  Occurrence,
  type StewardAudienceOccurrence,
} from "./occurrence";

/** Who an occurrence is addressed to, before the facts name the accounts. */
export type Audience =
  | Readonly<{ kind: "account"; accountId: AccountId }>
  | Readonly<{
      kind: "stewards";
      target: StewardedRef;
      except: AccountId | null;
    }>
  | Readonly<{ kind: "role"; role: Role }>
  | Readonly<{ kind: "email"; email: EmailAddress }>;

export type InviteeDelivered = Readonly<{
  occurrence: Extract<DirectAudienceOccurrence, { to: "invitee" }>;
  delivery: "direct";
}>;

/**
 * The recipients of one announcement. `emailOnly` — mail without an in-app
 * notification — is representable for invitations only.
 */
export type Addressees =
  | Readonly<{
      delivered: DeliveredOccurrence;
      /** No duplicates; empty when nobody is addressed. */
      to: Readonly<{ kind: "accounts"; accountIds: readonly AccountId[] }>;
    }>
  | Readonly<{
      delivered: InviteeDelivered;
      to: Readonly<{ kind: "emailOnly"; email: EmailAddress }>;
    }>;

/**
 * The facts addressing reads at consumption time — never the before/after
 * states an event's payload might suggest.
 */
export type AddressingFacts = Readonly<{
  /** The stored stewardship of the `stewards` audience's target; `null`: none stored (vacant). */
  stewardship: Stewardship | null;
  /** `unestablished` before the opening set-up: no operator at all. */
  operators: OperatorRoster;
  editors: EditorRoster;
  /** For the `email` audience: the account holding the address, if any. */
  inviteeAccount: AccountId | null;
}>;

export type StewardsAddress = Readonly<{
  target: StewardedRef;
  /** The one steward left out (`steward_added`'s appointee); `null` otherwise. */
  except: AccountId | null;
}>;

/** Whose stewards a steward-audience occurrence goes to, and who is left out. */
function stewardsOf(o: StewardAudienceOccurrence): StewardsAddress {
  switch (o.to) {
    case "applicant":
      return {
        target: { kind: "place", id: o.applicant.placeId },
        except: null,
      };
    case "approver":
      return { target: o.approver.target, except: null };
    case "placeStewards":
      return {
        target: { kind: "place", id: o.placeId },
        except:
          o.subject.kind === "place" &&
          o.subject.matter.kind === "steward_added"
            ? o.subject.matter.appointee
            : null,
      };
    case "regionStewards":
      return { target: { kind: "region", id: o.regionId }, except: null };
    case "occasionStewards":
      return { target: { kind: "occasion", id: o.occasionId }, except: null };
    case "contentManagers":
      return "placeId" in o
        ? { target: { kind: "place", id: o.placeId }, except: null }
        : { target: o.content, except: null };
  }
}

type RoleAudienceOccurrence = Extract<
  DirectAudienceOccurrence,
  { to: "approver" | "operators" | "editors" | "contentManagers" }
>;

function roleOf(o: RoleAudienceOccurrence): Role {
  switch (o.to) {
    case "approver":
    case "operators":
      return "operator";
    case "editors":
    case "contentManagers":
      return "editor";
  }
}

function audienceOf(a: Announcement): Audience {
  if (Announcement.isToAccount(a)) {
    return { kind: "account", accountId: a.accountId };
  }
  const o = a.occurrence;
  if (Occurrence.isStewardAudience(o)) {
    return { kind: "stewards", ...stewardsOf(o) };
  }
  if (o.to === "invitee") return { kind: "email", email: o.email };
  return { kind: "role", role: roleOf(o) };
}

const distinct = (ids: readonly AccountId[]): readonly AccountId[] => [
  ...new Set(ids),
];

const holderIds = (roster: OperatorRoster | EditorRoster) =>
  RoleRoster.holders(roster).map((holder) => holder.accountId);

/**
 * The recipients and delivery of an announcement (I-05, I-16). A vacant
 * target's stewards are stood in for by every operator (`proxy`); with no
 * operator yet, and for any other empty audience, nobody is addressed.
 * Never throws.
 */
function resolve(a: Announcement, facts: AddressingFacts): Addressees {
  if (Announcement.isToAccount(a)) {
    return {
      delivered: { occurrence: a.occurrence, delivery: "direct" },
      to: { kind: "accounts", accountIds: [a.accountId] },
    };
  }
  const o = a.occurrence;
  if (Occurrence.isStewardAudience(o)) {
    const { except } = stewardsOf(o);
    const s = facts.stewardship;
    if (s !== null && !Stewardship.isVacant(s)) {
      return {
        delivered: { occurrence: o, delivery: "direct" },
        to: {
          kind: "accounts",
          accountIds: distinct(
            Stewardship.stewards(s)
              .map((steward) => steward.accountId)
              .filter((id) => id !== except),
          ),
        },
      };
    }
    return {
      delivered: { occurrence: o, delivery: "proxy" },
      to: {
        kind: "accounts",
        accountIds: distinct(holderIds(facts.operators)),
      },
    };
  }
  if (o.to === "invitee") {
    const delivered: InviteeDelivered = { occurrence: o, delivery: "direct" };
    return facts.inviteeAccount === null
      ? { delivered, to: { kind: "emailOnly", email: o.email } }
      : {
          delivered,
          to: { kind: "accounts", accountIds: [facts.inviteeAccount] },
        };
  }
  const roster = roleOf(o) === "operator" ? facts.operators : facts.editors;
  return {
    delivered: { occurrence: o, delivery: "direct" },
    to: { kind: "accounts", accountIds: distinct(holderIds(roster)) },
  };
}

/**
 * Addressing: the only place the recipient rules live. Pure — the usecase
 * reads the facts through the other domains' ports and passes them in.
 */
export const Addressing = { stewardsOf, audienceOf, resolve };
