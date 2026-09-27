import { FakeIdGenerator } from "@repo/core/application/__tests__/fakes/fakeIdGenerator";
import { ConflictError, NotFoundError } from "@repo/core/application/errors";
import {
  LoginChallenge,
  LoginChallengeId,
  type PendingLoginChallenge,
} from "@repo/core/domain/account/loginChallenge";
import { SecretDigest } from "@repo/core/domain/account/loginSecret";
import { EmailAddress } from "@repo/core/domain/common/emailAddress";
import type {
  ExpectedVersion,
  Versioned,
} from "@repo/core/domain/common/transactionalRepository";
import { describe, expect, it } from "vitest";
import { barrier, ScopeAbort } from "./fixtures";
import type { ConformanceHarness, HarnessFactory } from "./harness";

const T = new Date("2026-09-28T00:00:00.000Z");
const MINUTE = 60 * 1000;
const MAX_ATTEMPTS = 3;

type ChallengeOptions = Readonly<{
  email?: string;
  expiresAt?: Date;
  linkTokenDigest?: string;
  codeDigest?: string;
  id?: string;
}>;

/**
 * Pending challenges with distinct ids and digests, expiring an hour after
 * T unless told otherwise — minted per test.
 */
function challengeFactory() {
  const ids = new FakeIdGenerator();
  let n = 0;
  return (options: ChallengeOptions = {}): PendingLoginChallenge => {
    n += 1;
    const expiresAt = options.expiresAt ?? new Date(T.getTime() + 60 * MINUTE);
    const validForMs = 15 * MINUTE;
    return LoginChallenge.issue(
      {
        id: LoginChallengeId.create(options.id ?? ids.next()),
        email: EmailAddress.create(options.email ?? `user${n}@example.com`),
        linkTokenDigest: SecretDigest.create(
          options.linkTokenDigest ?? `link-digest-${n}`,
        ),
        codeDigest: SecretDigest.create(
          options.codeDigest ?? `code-digest-${n}`,
        ),
        validForMs,
      },
      new Date(expiresAt.getTime() - validForMs),
    );
  };
}

/** A moment the challenge is still usable at. */
const before = (c: LoginChallenge) => new Date(c.expiresAt.getTime() - 1);

const redeemedByLink = (c: LoginChallenge) =>
  LoginChallenge.redeemByLink(c, c.linkTokenDigest, before(c));

const redeemedByCode = (c: LoginChallenge) => {
  const result = LoginChallenge.redeemByCode(
    c,
    c.codeDigest,
    MAX_ATTEMPTS,
    before(c),
  );
  if (result.outcome !== "redeemed") throw new Error("expected a redemption");
  return result.challenge;
};

const WRONG = SecretDigest.create("wrong-code-digest");

const oneMismatch = (c: LoginChallenge) =>
  LoginChallenge.redeemByCode(c, WRONG, MAX_ATTEMPTS, before(c)).challenge;

const exhausted = (c: LoginChallenge) =>
  LoginChallenge.redeemByCode(c, WRONG, 1, before(c)).challenge;

async function insert(
  h: ConformanceHarness,
  ...challenges: readonly LoginChallenge[]
): Promise<void> {
  await h.uow.run(async ({ loginChallengeRepository }) => {
    for (const challenge of challenges) {
      await loginChallengeRepository.insert(challenge);
    }
  });
}

function findById(h: ConformanceHarness, c: LoginChallenge) {
  return h.uow.run(({ loginChallengeRepository }) =>
    loginChallengeRepository.findById(c.id),
  );
}

function findByLink(h: ConformanceHarness, digest: SecretDigest) {
  return h.uow.run(({ loginChallengeRepository }) =>
    loginChallengeRepository.findByLinkTokenDigest(digest),
  );
}

async function get(
  h: ConformanceHarness,
  c: LoginChallenge,
): Promise<Versioned<LoginChallenge>> {
  const found = await findById(h, c);
  if (found === null) throw new Error(`no login challenge ${c.id}`);
  return found;
}

function save(
  h: ConformanceHarness,
  c: LoginChallenge,
  expectedVersion: ExpectedVersion<LoginChallenge>,
) {
  return h.uow.run(({ loginChallengeRepository }) =>
    loginChallengeRepository.save(c, expectedVersion),
  );
}

function deleteClosedBefore(h: ConformanceHarness, threshold: Date) {
  return h.uow.run(({ loginChallengeRepository }) =>
    loginChallengeRepository.deleteClosedBefore(threshold),
  );
}

/** Inserts `c` and saves `transition(c)` over it. */
async function store(
  h: ConformanceHarness,
  c: PendingLoginChallenge,
  transition: (c: LoginChallenge) => LoginChallenge,
): Promise<LoginChallenge> {
  await insert(h, c);
  const read = await get(h, c);
  const next = transition(read.entity);
  await save(h, next, read.expectedVersion);
  return next;
}

/** `spec/testcases/ports/loginChallengeRepository.md`. */
export function describeLoginChallengeRepositoryContract(
  makeHarness: HarnessFactory,
): void {
  describe("LoginChallengeRepository contract", () => {
    describe("insert、findById、findByLinkTokenDigest", () => {
      it("loginChallengeRepository#1 空 / insert(C1) の後、findById(C1.id)", async () => {
        const h = await makeHarness();
        const C1 = challengeFactory()();
        await insert(h, C1);
        const found = await findById(h, C1);
        expect(found?.entity).toEqual(C1);
        expect(found?.entity).toMatchObject({
          status: "pending",
          failedCodeAttempts: 0,
        });
        expect(typeof found?.expectedVersion).toBe("number");
      });

      it("loginChallengeRepository#2 insert(C1) 済み / findByLinkTokenDigest(C1.linkTokenDigest)", async () => {
        const h = await makeHarness();
        const C1 = challengeFactory()();
        await insert(h, C1);
        const byId = await get(h, C1);
        expect(await findByLink(h, C1.linkTokenDigest)).toEqual(byId);
      });

      it("loginChallengeRepository#3 空 / findById(C1.id)、findByLinkTokenDigest(C1.linkTokenDigest)", async () => {
        const h = await makeHarness();
        const C1 = challengeFactory()();
        expect(await findById(h, C1)).toBeNull();
        expect(await findByLink(h, C1.linkTokenDigest)).toBeNull();
      });

      it("loginChallengeRepository#4 insert(C1) 済み / findByLinkTokenDigest(C1.codeDigest)", async () => {
        const h = await makeHarness();
        const C1 = challengeFactory()();
        await insert(h, C1);
        expect(await findByLink(h, C1.codeDigest)).toBeNull();
      });

      it("loginChallengeRepository#5 insert(C1) 済み / 同じ id で、違う linkTokenDigest のログインの確認を insert", async () => {
        const h = await makeHarness();
        const next = challengeFactory();
        const C1 = next();
        const other = next({ id: C1.id });
        await insert(h, C1);
        await expect(insert(h, other)).rejects.toBeInstanceOf(ConflictError);
        expect((await findById(h, C1))?.entity).toEqual(C1);
      });

      it("loginChallengeRepository#6 insert(C1) 済み / 違う id で、同じ linkTokenDigest のログインの確認を insert", async () => {
        const h = await makeHarness();
        const next = challengeFactory();
        const C1 = next();
        const other = next({ linkTokenDigest: C1.linkTokenDigest });
        await insert(h, C1);
        await expect(insert(h, other)).rejects.toBeInstanceOf(ConflictError);
        expect((await findByLink(h, C1.linkTokenDigest))?.entity).toEqual(C1);
        expect(await findById(h, other)).toBeNull();
      });

      it("loginChallengeRepository#7 insert(C1) 済み / 違う id・違う linkTokenDigest で、C1 と同じ email・同じ codeDigest のログインの確認を insert", async () => {
        const h = await makeHarness();
        const next = challengeFactory();
        const C1 = next();
        const C2 = next({ email: C1.email, codeDigest: C1.codeDigest });
        await insert(h, C1);
        await insert(h, C2);
        expect((await findById(h, C1))?.entity).toEqual(C1);
        expect((await findById(h, C2))?.entity).toEqual(C2);
      });

      it("loginChallengeRepository#8 C1 は redeemed で保存されている / findByLinkTokenDigest(C1.linkTokenDigest)", async () => {
        const h = await makeHarness();
        const C1 = challengeFactory()();
        const redeemed = await store(h, C1, redeemedByLink);
        const found = await findByLink(h, C1.linkTokenDigest);
        expect(found?.entity).toEqual(redeemed);
        expect(found?.entity.status).toBe("redeemed");
      });

      it("loginChallengeRepository#9 C1 は exhausted で保存されている / findByLinkTokenDigest(C1.linkTokenDigest)", async () => {
        const h = await makeHarness();
        const C1 = challengeFactory()();
        const closed = await store(h, C1, exhausted);
        const found = await findByLink(h, C1.linkTokenDigest);
        expect(found?.entity).toEqual(closed);
        expect(found?.entity.status).toBe("exhausted");
      });

      it("loginChallengeRepository#10 C1 は pending で、expiresAt を過ぎている / findByLinkTokenDigest(C1.linkTokenDigest)、findById(C1.id)", async () => {
        const h = await makeHarness();
        const C1 = challengeFactory()({
          expiresAt: new Date(T.getTime() - MINUTE),
        });
        await insert(h, C1);
        expect((await findByLink(h, C1.linkTokenDigest))?.entity).toEqual(C1);
        expect((await findById(h, C1))?.entity).toEqual(C1);
      });
    });

    describe("countUnexpired", () => {
      const E = "e@example.com";
      const F = "f@example.com";
      const later = new Date(T.getTime() + MINUTE);
      const count = (h: ConformanceHarness, email: string, now: Date) =>
        h.uow.run(({ loginChallengeRepository }) =>
          loginChallengeRepository.countUnexpired(
            EmailAddress.create(email),
            now,
          ),
        );

      it("loginChallengeRepository#11 空 / countUnexpired(E, now)", async () => {
        const h = await makeHarness();
        expect(await count(h, E, T)).toBe(0);
      });

      it("loginChallengeRepository#12 email が E で expiresAt が now より後のログインの確認が、pending・redeemed・exhausted で1件ずつ / countUnexpired(E, now)", async () => {
        const h = await makeHarness();
        const next = challengeFactory();
        await insert(h, next({ email: E, expiresAt: later }));
        await store(h, next({ email: E, expiresAt: later }), redeemedByLink);
        await store(h, next({ email: E, expiresAt: later }), exhausted);
        expect(await count(h, E, T)).toBe(3);
      });

      it("loginChallengeRepository#13 email が E で expiresAt が now と等しいログインの確認が1件、now より前のものが1件 / countUnexpired(E, now)", async () => {
        const h = await makeHarness();
        const next = challengeFactory();
        await insert(
          h,
          next({ email: E, expiresAt: T }),
          next({ email: E, expiresAt: new Date(T.getTime() - 1) }),
        );
        expect(await count(h, E, T)).toBe(0);
      });

      it("loginChallengeRepository#14 email が E のものが1件、F のものが2件（どれも expiresAt が now より後） / countUnexpired(E, now)", async () => {
        const h = await makeHarness();
        const next = challengeFactory();
        await insert(
          h,
          next({ email: E, expiresAt: later }),
          next({ email: F, expiresAt: later }),
          next({ email: F, expiresAt: later }),
        );
        expect(await count(h, E, T)).toBe(1);
        expect(await count(h, F, T)).toBe(2);
      });

      it("loginChallengeRepository#15 email が E の redeemed のログインの確認が1件（expiresAt が now より後）で、deleteClosedBefore(now) を実行した後 / countUnexpired(E, now)", async () => {
        const h = await makeHarness();
        await store(
          h,
          challengeFactory()({ email: E, expiresAt: later }),
          redeemedByLink,
        );
        expect(await count(h, E, T)).toBe(1);
        await deleteClosedBefore(h, T);
        expect(await count(h, E, T)).toBe(0);
      });
    });

    describe("save", () => {
      it("loginChallengeRepository#16 insert(C1) 済み。findById で expectedVersion を得ている / 誤入力を1回数えた C1（pending、failedCodeAttempts: 1）を save し、findById", async () => {
        const h = await makeHarness();
        const C1 = challengeFactory()();
        await insert(h, C1);
        const v = await get(h, C1);
        const counted = oneMismatch(v.entity);
        await save(h, counted, v.expectedVersion);
        const after = await get(h, C1);
        expect(after.entity).toEqual(counted);
        expect(after.entity).toMatchObject({
          status: "pending",
          failedCodeAttempts: 1,
        });
        expect(after.expectedVersion).not.toBe(v.expectedVersion);
      });

      it("loginChallengeRepository#17 insert(C1) 済み / リンクで使用した C1（redeemed）を save し、findById", async () => {
        const h = await makeHarness();
        const C1 = challengeFactory()();
        const redeemed = await store(h, C1, redeemedByLink);
        const found = await get(h, C1);
        expect(found.entity).toEqual(redeemed);
        expect(found.entity.status).toBe("redeemed");
      });

      it("loginChallengeRepository#18 insert(C1) 済み / exhausted にした C1 を save し、findById", async () => {
        const h = await makeHarness();
        const C1 = challengeFactory()();
        const closed = await store(h, C1, exhausted);
        const found = await get(h, C1);
        expect(found.entity).toEqual(closed);
        expect(found.entity.status).toBe("exhausted");
      });

      it("loginChallengeRepository#19 insert(C1) 済み。expectedVersion V を得た後、別の save が成功している / V で save", async () => {
        const h = await makeHarness();
        const C1 = challengeFactory()();
        await insert(h, C1);
        const v = await get(h, C1);
        const first = oneMismatch(v.entity);
        await save(h, first, v.expectedVersion);
        await expect(
          save(h, redeemedByLink(v.entity), v.expectedVersion),
        ).rejects.toBeInstanceOf(ConflictError);
        expect((await get(h, C1)).entity).toEqual(first);
      });

      it("loginChallengeRepository#20 insert(C1) 済み / 同じ expectedVersion で、リンクで使用した C1 の save と、コードで使用した C1 の save を、別々の UnitOfWork で同時に実行する", async () => {
        const h = await makeHarness();
        const C1 = challengeFactory()();
        await insert(h, C1);
        const bothRead = barrier(2);
        const attempt = (redeem: (c: LoginChallenge) => LoginChallenge) =>
          h.uow.run(async ({ loginChallengeRepository }) => {
            const read = await loginChallengeRepository.findById(C1.id);
            if (read === null) throw new Error("missing");
            await bothRead();
            await loginChallengeRepository.save(
              redeem(read.entity),
              read.expectedVersion,
            );
          });
        const results = await Promise.allSettled([
          attempt(redeemedByLink),
          attempt(redeemedByCode),
        ]);
        const rejected = results.filter(
          (r): r is PromiseRejectedResult => r.status === "rejected",
        );
        expect(rejected).toHaveLength(1);
        expect(rejected[0]?.reason).toBeInstanceOf(ConflictError);
        expect((await get(h, C1)).entity.status).toBe("redeemed");
      });

      it("loginChallengeRepository#21 insert(C1) 済み / 同じ expectedVersion で、誤入力を1回数えた C1 の save を、別々の UnitOfWork で同時に2つ実行する", async () => {
        const h = await makeHarness();
        const C1 = challengeFactory()();
        await insert(h, C1);
        const bothRead = barrier(2);
        const attempt = () =>
          h.uow.run(async ({ loginChallengeRepository }) => {
            const read = await loginChallengeRepository.findById(C1.id);
            if (read === null) throw new Error("missing");
            await bothRead();
            await loginChallengeRepository.save(
              oneMismatch(read.entity),
              read.expectedVersion,
            );
          });
        const results = await Promise.allSettled([attempt(), attempt()]);
        const rejected = results.filter(
          (r): r is PromiseRejectedResult => r.status === "rejected",
        );
        expect(rejected).toHaveLength(1);
        expect(rejected[0]?.reason).toBeInstanceOf(ConflictError);
        expect((await get(h, C1)).entity).toMatchObject({
          status: "pending",
          failedCodeAttempts: 1,
        });
      });

      it("loginChallengeRepository#22 空 / save(C1, expectedVersion)", async () => {
        const h = await makeHarness();
        const C1 = challengeFactory()();
        await expect(
          save(h, C1, C1.version as number as ExpectedVersion<LoginChallenge>),
        ).rejects.toBeInstanceOf(NotFoundError);
      });
    });

    describe("deleteClosedBefore", () => {
      it("loginChallengeRepository#23 空 / deleteClosedBefore(T)", async () => {
        const h = await makeHarness();
        await expect(deleteClosedBefore(h, T)).resolves.toBeUndefined();
      });

      it("loginChallengeRepository#24 pending で expiresAt が T より後のログインの確認が1件 / deleteClosedBefore(T)", async () => {
        const h = await makeHarness();
        const C1 = challengeFactory()({ expiresAt: new Date(T.getTime() + 1) });
        await insert(h, C1);
        await deleteClosedBefore(h, T);
        expect((await findById(h, C1))?.entity).toEqual(C1);
      });

      it("loginChallengeRepository#25 pending で expiresAt が T より前のログインの確認が1件 / deleteClosedBefore(T)", async () => {
        const h = await makeHarness();
        const C1 = challengeFactory()({ expiresAt: new Date(T.getTime() - 1) });
        await insert(h, C1);
        await deleteClosedBefore(h, T);
        expect(await findById(h, C1)).toBeNull();
        expect(await findByLink(h, C1.linkTokenDigest)).toBeNull();
      });

      it("loginChallengeRepository#26 pending で expiresAt が T と等しいログインの確認が1件 / deleteClosedBefore(T)", async () => {
        const h = await makeHarness();
        const C1 = challengeFactory()({ expiresAt: T });
        await insert(h, C1);
        await deleteClosedBefore(h, T);
        expect((await findById(h, C1))?.entity).toEqual(C1);
      });

      it("loginChallengeRepository#27 redeemed で expiresAt が T より後、exhausted で expiresAt が T より後のログインの確認が1件ずつ / deleteClosedBefore(T)", async () => {
        const h = await makeHarness();
        const next = challengeFactory();
        const later = new Date(T.getTime() + 60 * MINUTE);
        const C1 = next({ expiresAt: later });
        const C2 = next({ expiresAt: later });
        await store(h, C1, redeemedByLink);
        await store(h, C2, exhausted);
        await deleteClosedBefore(h, T);
        expect(await findById(h, C1)).toBeNull();
        expect(await findById(h, C2)).toBeNull();
      });

      it("loginChallengeRepository#28 redeemed、exhausted、期限切れの pending、有効期間内の pending が1件ずつ / deleteClosedBefore(T) を2回続けて呼ぶ", async () => {
        const h = await makeHarness();
        const next = challengeFactory();
        const redeemed = next();
        const closed = next();
        const expired = next({ expiresAt: new Date(T.getTime() - MINUTE) });
        const usable = next({ expiresAt: new Date(T.getTime() + MINUTE) });
        await store(h, redeemed, redeemedByLink);
        await store(h, closed, exhausted);
        await insert(h, expired, usable);
        const remaining = async () =>
          (
            await Promise.all(
              [redeemed, closed, expired, usable].map((c) => findById(h, c)),
            )
          )
            .filter((found) => found !== null)
            .map((found) => found.entity);
        await expect(deleteClosedBefore(h, T)).resolves.toBeUndefined();
        expect(await remaining()).toEqual([usable]);
        await expect(deleteClosedBefore(h, T)).resolves.toBeUndefined();
        expect(await remaining()).toEqual([usable]);
      });

      it("loginChallengeRepository#29 redeemed の C1 がある。findById で expectedVersion V を得ている / deleteClosedBefore(T) の後、V で save(C1, V)", async () => {
        const h = await makeHarness();
        const C1 = challengeFactory()();
        await store(h, C1, redeemedByLink);
        const v = await get(h, C1);
        await deleteClosedBefore(h, T);
        expect(await findById(h, C1)).toBeNull();
        await expect(
          save(h, v.entity, v.expectedVersion),
        ).rejects.toBeInstanceOf(NotFoundError);
      });
    });

    describe("可視性と UnitOfWork", () => {
      it("loginChallengeRepository#30 insert(C1) 済み / UnitOfWork の中で、使用した C1 を save してコミットし、直後に別の UnitOfWork で findById・findByLinkTokenDigest", async () => {
        const h = await makeHarness();
        const C1 = challengeFactory()();
        const redeemed = await store(h, C1, redeemedByLink);
        const [byId, byLink] = await h.uow.run(
          async ({ loginChallengeRepository }) =>
            Promise.all([
              loginChallengeRepository.findById(C1.id),
              loginChallengeRepository.findByLinkTokenDigest(
                C1.linkTokenDigest,
              ),
            ]),
        );
        expect(byId?.entity).toEqual(redeemed);
        expect(byLink?.entity).toEqual(redeemed);
      });

      it("loginChallengeRepository#31 insert(C1) 済み / UnitOfWork の中で、使用した C1 を save し、fn が例外を投げる", async () => {
        const h = await makeHarness();
        const C1 = challengeFactory()();
        await insert(h, C1);
        const v = await get(h, C1);
        const abort = new ScopeAbort();
        await expect(
          h.uow.run(async ({ loginChallengeRepository }) => {
            await loginChallengeRepository.save(
              redeemedByLink(v.entity),
              v.expectedVersion,
            );
            throw abort;
          }),
        ).rejects.toBe(abort);
        expect(await get(h, C1)).toEqual(v);
      });

      it("loginChallengeRepository#32 空 / UnitOfWork の中で insert(C1) と insert(C2) を行い、fn が例外を投げる", async () => {
        const h = await makeHarness();
        const next = challengeFactory();
        const [C1, C2] = [next(), next()];
        const abort = new ScopeAbort();
        await expect(
          h.uow.run(async ({ loginChallengeRepository }) => {
            await loginChallengeRepository.insert(C1);
            await loginChallengeRepository.insert(C2);
            throw abort;
          }),
        ).rejects.toBe(abort);
        expect(await findById(h, C1)).toBeNull();
        expect(await findById(h, C2)).toBeNull();
      });

      it("loginChallengeRepository#33 redeemed の C1 がある / UnitOfWork の中で deleteClosedBefore(T) を行い、fn が例外を投げる", async () => {
        const h = await makeHarness();
        const C1 = challengeFactory()();
        const redeemed = await store(h, C1, redeemedByLink);
        const abort = new ScopeAbort();
        await expect(
          h.uow.run(async ({ loginChallengeRepository }) => {
            await loginChallengeRepository.deleteClosedBefore(T);
            throw abort;
          }),
        ).rejects.toBe(abort);
        expect((await findById(h, C1))?.entity).toEqual(redeemed);
      });

      it("loginChallengeRepository#34 insert(C1) 済み / UnitOfWork の中で、insert(C2) と、古い expectedVersion での C1 の save を行う", async () => {
        const h = await makeHarness();
        const next = challengeFactory();
        const [C1, C2] = [next(), next()];
        await insert(h, C1);
        const stale = await get(h, C1);
        await save(h, oneMismatch(stale.entity), stale.expectedVersion);
        await expect(
          h.uow.run(async ({ loginChallengeRepository }) => {
            await loginChallengeRepository.insert(C2);
            await loginChallengeRepository.save(
              redeemedByLink(stale.entity),
              stale.expectedVersion,
            );
          }),
        ).rejects.toBeInstanceOf(ConflictError);
        expect(await findById(h, C2)).toBeNull();
      });
    });
  });
}
