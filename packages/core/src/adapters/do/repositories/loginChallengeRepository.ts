import { SystemError, SystemErrorCode } from "@repo/core/application/errors";
import type { IdGenerator } from "@repo/core/application/ports/idGenerator";
import {
  LoginChallenge,
  type LoginChallengeId,
} from "@repo/core/domain/account/loginChallenge";
import type { SecretDigest } from "@repo/core/domain/account/loginSecret";
import type { LoginChallengeRepository } from "@repo/core/domain/account/ports/loginChallengeRepository";
import type { EmailAddress } from "@repo/core/domain/common/emailAddress";
import type {
  ExpectedVersion,
  Versioned,
} from "@repo/core/domain/common/transactionalRepository";
import { isRehydrationError } from "@repo/core/domain/error";
import { mapDoError } from "../helpers";
import type { LoginChallengeRecord } from "../protocol/account";
import type { LuntStateClient } from "../protocol/client";
import type { WriteCommand } from "../protocol/commands";

/**
 * `LoginChallengeRepository` over the Lunt state object. Reads query the
 * object immediately; writes append commands to the unit of work's
 * buffer, applied — with the id / link-digest uniqueness and the
 * optimistic lock — when the unit of work commits.
 */
export class DoLoginChallengeRepository implements LoginChallengeRepository {
  constructor(
    private readonly client: LuntStateClient,
    private readonly writes: WriteCommand[],
    private readonly idGenerator: IdGenerator,
  ) {}

  private toVersioned(record: LoginChallengeRecord): Versioned<LoginChallenge> {
    if (this.idGenerator.parse(record.id) === null) {
      throw new SystemError(
        SystemErrorCode.DataIntegrityError,
        `Stored login challenge has malformed id: ${record.id}`,
      );
    }
    try {
      return {
        entity: LoginChallenge.reconstruct({
          ...record,
          expiresAt: new Date(record.expiresAt),
        }),
        expectedVersion: record.version as ExpectedVersion<LoginChallenge>,
      };
    } catch (error) {
      if (isRehydrationError(error)) {
        throw new SystemError(
          SystemErrorCode.DataIntegrityError,
          "Stored login challenge violates invariants",
          error,
        );
      }
      throw error;
    }
  }

  private static toRecord(challenge: LoginChallenge): LoginChallengeRecord {
    const snapshot = LoginChallenge.snapshot(challenge);
    return {
      ...snapshot,
      status: challenge.status,
      expiresAt: snapshot.expiresAt.getTime(),
    };
  }

  findById(id: LoginChallengeId): Promise<Versioned<LoginChallenge> | null> {
    return mapDoError("Failed to find login challenge", async () => {
      const record = await this.client.query(
        "account.loginChallenge.findById",
        { id },
      );
      return record === null ? null : this.toVersioned(record);
    });
  }

  findByLinkTokenDigest(
    digest: SecretDigest,
  ): Promise<Versioned<LoginChallenge> | null> {
    return mapDoError("Failed to find login challenge by link", async () => {
      const record = await this.client.query(
        "account.loginChallenge.findByLinkTokenDigest",
        { digest },
      );
      return record === null ? null : this.toVersioned(record);
    });
  }

  countUnexpired(email: EmailAddress, now: Date): Promise<number> {
    return mapDoError("Failed to count login challenges", () =>
      this.client.query("account.loginChallenge.countUnexpired", {
        email,
        now: now.getTime(),
      }),
    );
  }

  async insert(challenge: LoginChallenge): Promise<void> {
    this.writes.push({
      kind: "account.loginChallenge.insert",
      record: DoLoginChallengeRepository.toRecord(challenge),
    });
  }

  async save(
    challenge: LoginChallenge,
    expectedVersion: ExpectedVersion<LoginChallenge>,
  ): Promise<void> {
    this.writes.push({
      kind: "account.loginChallenge.save",
      record: DoLoginChallengeRepository.toRecord(challenge),
      expectedVersion,
    });
  }

  async deleteClosedBefore(threshold: Date): Promise<void> {
    this.writes.push({
      kind: "account.loginChallenge.deleteClosedBefore",
      threshold: threshold.getTime(),
    });
  }
}
