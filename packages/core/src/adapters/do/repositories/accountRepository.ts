import { SystemError, SystemErrorCode } from "@repo/core/application/errors";
import type { IdGenerator } from "@repo/core/application/ports/idGenerator";
import { Account } from "@repo/core/domain/account/entity";
import type { AccountRepository } from "@repo/core/domain/account/ports/accountRepository";
import type { EmailAddress } from "@repo/core/domain/common/emailAddress";
import { IdBatch } from "@repo/core/domain/common/idBatch";
import type { AccountId } from "@repo/core/domain/common/ids";
import type {
  ExpectedVersion,
  Versioned,
} from "@repo/core/domain/common/transactionalRepository";
import { isRehydrationError } from "@repo/core/domain/error";
import { mapDoError } from "../helpers";
import type { AccountRecord } from "../protocol/account";
import type { LuntStateClient } from "../protocol/client";
import type { WriteCommand } from "../protocol/commands";

/**
 * `AccountRepository` over the Lunt state object. Reads query the object
 * immediately; writes append commands to the unit of work's buffer,
 * which the object applies — with the id / email uniqueness and
 * optimistic-lock checks — when the unit of work commits.
 */
export class DoAccountRepository implements AccountRepository {
  constructor(
    private readonly client: LuntStateClient,
    private readonly writes: WriteCommand[],
    private readonly idGenerator: IdGenerator,
  ) {}

  private toAccount(record: AccountRecord): Account {
    if (this.idGenerator.parse(record.id) === null) {
      throw new SystemError(
        SystemErrorCode.DataIntegrityError,
        `Stored account has malformed id: ${record.id}`,
      );
    }
    try {
      return Account.reconstruct(record);
    } catch (error) {
      if (isRehydrationError(error)) {
        throw new SystemError(
          SystemErrorCode.DataIntegrityError,
          "Stored account violates invariants",
          error,
        );
      }
      throw error;
    }
  }

  private toVersioned(record: AccountRecord): Versioned<Account> {
    return {
      entity: this.toAccount(record),
      expectedVersion: record.version as ExpectedVersion<Account>,
    };
  }

  private static toRecord(account: Account): AccountRecord {
    return { id: account.id, email: account.email, version: account.version };
  }

  findById(id: AccountId): Promise<Versioned<Account> | null> {
    return mapDoError("Failed to find account", async () => {
      const record = await this.client.query("account.findById", { id });
      return record === null ? null : this.toVersioned(record);
    });
  }

  findByEmail(email: EmailAddress): Promise<Versioned<Account> | null> {
    return mapDoError("Failed to find account by email", async () => {
      const record = await this.client.query("account.findByEmail", {
        email,
      });
      return record === null ? null : this.toVersioned(record);
    });
  }

  async findByIds(ids: readonly AccountId[]): Promise<readonly Account[]> {
    IdBatch.assertWithinLimit(ids);
    if (ids.length === 0) return [];
    return mapDoError("Failed to find accounts", async () => {
      const records = await this.client.query("account.findByIds", { ids });
      return records.map((record) => this.toAccount(record));
    });
  }

  async insert(account: Account): Promise<void> {
    this.writes.push({
      kind: "account.insert",
      record: DoAccountRepository.toRecord(account),
    });
  }

  async save(
    account: Account,
    expectedVersion: ExpectedVersion<Account>,
  ): Promise<void> {
    this.writes.push({
      kind: "account.save",
      record: DoAccountRepository.toRecord(account),
      expectedVersion,
    });
  }

  async delete(
    id: AccountId,
    expectedVersion: ExpectedVersion<Account>,
  ): Promise<void> {
    this.writes.push({ kind: "account.delete", id, expectedVersion });
  }
}
