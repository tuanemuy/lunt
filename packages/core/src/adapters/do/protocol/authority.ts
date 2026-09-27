import type { QuerySpec } from "./queries";

/** A `StewardedRef` on the wire. */
export type TargetRecord = Readonly<{ kind: string; id: string }>;

/** At-rest shape of a stewardship. Dates travel as `Date`. */
export type StewardshipRecord = Readonly<{
  target: TargetRecord;
  status: string;
  stewards: readonly Readonly<{ accountId: string; since: Date }>[];
  invitations: readonly Readonly<{
    id: string;
    email: string;
    invitedAt: Date;
  }>[];
  version: number;
}>;

/** At-rest shape of a role roster; `status` is `null` for editors. */
export type RoleRosterRecord = Readonly<{
  role: string;
  status: string | null;
  holders: readonly Readonly<{ accountId: string; since: Date }>[];
  version: number;
}>;

export type StewardedTargetRecord = Readonly<{
  target: TargetRecord;
  name: string | null;
}>;

/**
 * Authority's named reads and write commands on the Lunt state object. Add a
 * `QuerySpec` per read and a command per write; the handler tables in
 * `store/authority.ts` must cover every one.
 */
export type AuthorityQueries = {
  "authority.findStewardship": QuerySpec<
    { target: TargetRecord },
    StewardshipRecord | null
  >;
  /** Stored stewardships among `targets` (at most 100). */
  "authority.findStewardshipsByTargets": QuerySpec<
    { targets: readonly TargetRecord[] },
    readonly StewardshipRecord[]
  >;
  "authority.findStewardshipPageBySteward": QuerySpec<
    { accountId: string; page: number; limit: number },
    Readonly<{ items: readonly StewardshipRecord[]; count: number }>
  >;
  "authority.findRoleRoster": QuerySpec<
    { role: string },
    RoleRosterRecord | null
  >;
  "authority.findRolesOf": QuerySpec<{ accountId: string }, readonly string[]>;
  /** Existing targets among `targets` (at most 100), in listing order. */
  "authority.describeTargets": QuerySpec<
    { targets: readonly TargetRecord[] },
    readonly StewardedTargetRecord[]
  >;
};

export type AuthorityCommand =
  | Readonly<{ kind: "authority.insertStewardship"; record: StewardshipRecord }>
  | Readonly<{
      kind: "authority.saveStewardship";
      record: StewardshipRecord;
      expectedVersion: number;
    }>
  | Readonly<{
      kind: "authority.saveRoleRoster";
      record: RoleRosterRecord;
      /** `null`: nothing is stored for the role yet (save if absent). */
      expectedVersion: number | null;
    }>;
