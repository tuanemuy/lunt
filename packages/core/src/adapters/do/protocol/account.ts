import type { QuerySpec } from "./queries";

/** At-rest shape of an account as the state object stores and returns it. */
export type AccountRecord = Readonly<{
  id: string;
  email: string;
  version: number;
}>;

export type AccountQueries = {
  "account.findById": QuerySpec<{ id: string }, AccountRecord | null>;
  "account.findByEmail": QuerySpec<{ email: string }, AccountRecord | null>;
  /** Existing accounts among `ids`, in id order. */
  "account.findByIds": QuerySpec<
    { ids: readonly string[] },
    readonly AccountRecord[]
  >;
};

export type AccountCommand =
  | Readonly<{ kind: "account.insert"; record: AccountRecord }>
  | Readonly<{
      kind: "account.save";
      record: AccountRecord;
      expectedVersion: number;
    }>
  | Readonly<{ kind: "account.delete"; id: string; expectedVersion: number }>;
