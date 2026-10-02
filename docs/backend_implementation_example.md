# Backend Implementation Guide

Copy-and-adapt patterns for adding a domain or a usecase to Lunt. Account (login, withdrawal) and Authority (stewardship, role rosters, access policy) are the reference vertical: every excerpt below is trimmed from them (`// …` marks a cut), so open the file for the rest.

- Principles and cross-cutting concepts (unit of work, outbox, idempotent create, validation, error kinds): `AGENTS.md`.
- The runtime (one Worker, one SQLite-backed Durable Object, Queues, cron, ops endpoints): `docs/runtime_cloudflare_do.md`.
- Test layers and rules: `docs/test.md`.
- What to build: `spec/domains/`, `spec/usecases/`, `spec/flows/`, `spec/testcases/`; implementation decisions: `spec/adr/`.

## 1. File layout

```
packages/core/src/
├── lib/error.ts                       CodedError, SerializedErrorBase (every layer extends these)
├── domain/
│   ├── error.ts                       BusinessRuleError, RehydrationError
│   ├── businessErrorCode.ts           union of every domain's codes          ← aggregator
│   ├── common/                        shared kernel: ids, EmailAddress, Version, refs, event, idBatch, …
│   └── {d}/                           account, authority, application, notification
│       ├── {entity}.ts                e.g. account/loginChallenge.ts, authority/stewardship.ts
│       ├── events.ts                  event types + draft factories
│       ├── errorCode.ts               {D}_… codes                            ← fragment
│       ├── accessPolicy.ts            (authority) pure policy
│       └── ports/
│           ├── {x}Repository.ts
│           └── unitOfWork.ts          the domain's repositories in a UoW     ← fragment
├── application/
│   ├── types.ts                       ServiceArgs, ActorServiceArgs
│   ├── errors.ts                      NotFound / Conflict / Unauthorized / Forbidden / SystemError
│   ├── ports/                         clock, idGenerator, logger, outboxRepository, consumerReceipts
│   ├── execution/unitOfWork.ts        UnitOfWorkContext / UnitOfWorkProvider  ← aggregator
│   ├── events/
│   │   ├── buildDecoder.ts            buildEventDecoder
│   │   ├── registry.ts                LuntDomainEvent + eventDecoders          ← aggregator
│   │   └── consumers.ts               defineConsumer, consumers                ← aggregator
│   ├── workers/
│   │   ├── dailyJobs.ts               DailyJob, runDailyJobs, drainPages
│   │   ├── dailyJobRegistry.ts        dailyJobs                              ← aggregator
│   │   └── eventRelayWorker.ts, eventDelivery.ts, outboxPrune.ts
│   ├── di/
│   │   ├── types.ts                   SharedDeps, RequestContainer, WorkerContainer ← aggregator
│   │   ├── container.ts               LuntEnv, createRequestContainer        ← aggregator
│   │   ├── {d}.ts                     {D}Env, create{D}Services               ← fragment
│   │   ├── mail.ts                    shared MailEnv / transport choice
│   │   └── serviceDeps.ts, env.ts, containerStore.ts, presentationPorts.ts
│   ├── __tests__/testContainer.ts     createTestContainer                    ← aggregator (tests)
│   └── {d}/
│       ├── {usecase}.ts
│       ├── services.ts                {D}Services: container-level ports     ← fragment
│       ├── eventDecoders.ts           {d}EventDecoders (domains with events) ← fragment
│       └── __tests__/testServices.ts  createTest{D}Services                   ← fragment (tests)
└── adapters/
    ├── do/                            the Lunt state Durable Object
    │   ├── protocol/
    │   │   ├── client.ts              LuntStateClient (query / commit / …)
    │   │   ├── queries.ts             QueryCatalog                           ← aggregator
    │   │   ├── commands.ts            WriteCommand, WriteFailure             ← aggregator
    │   │   └── {d}.ts                 {D}Queries, {D}Command, records        ← fragment
    │   ├── store/                     runs inside the object (synchronous SQL)
    │   │   ├── queries.ts / commands.ts  handler tables                      ← aggregators
    │   │   ├── schema.ts              MIGRATIONS, applyMigrations            ← aggregator
    │   │   ├── {d}.ts                 migrations + handlers                  ← fragment
    │   │   ├── versioned.ts           insertUnique / updateVersioned / deleteVersioned
    │   │   ├── stewardedTargetLookups.ts  per-kind lookups of the directory
    │   │   └── stateStore.ts          query / commit in one transaction
    │   ├── repositories/
    │   │   ├── index.ts               createRepositories                     ← aggregator
    │   │   ├── {d}.ts                 create{D}Repositories                  ← fragment
    │   │   └── {x}Repository.ts       request-side repository classes
    │   ├── unitOfWork.ts              DoUnitOfWorkProvider
    │   ├── stewardedTargetDirectory.ts   read-only port outside the UoW
    │   ├── __conformance__/           one port contract suite per port
    │   ├── __tests__/                 Node runners of the suites
    │   └── testing/                   node:sqlite harness
    ├── mail/                          MailTransport: SMTP, development inbox
    ├── login/                         LoginMailSender, LoginSecretGenerator
    └── identity/                      Google OIDC, fake IdP

apps/web/app/
├── server.ts                          fetch / queue / scheduled of the one Worker
├── durable-objects/luntState.ts       LuntStateObject (state, relay alarm, receipts)
├── durable-objects/__tests__/         Workers runners of the conformance suites
├── worker/                            queue.ts (consumers, DLQ), ops.ts (/__ops/*), stateClient.ts
└── presentation/
    ├── businessErrorCatalog.ts        code → screen state                    ← aggregator
    └── errorCatalog/{d}.ts            the domain's entries                   ← fragment
```

### Fragments and aggregators

Every shared registry is split per domain. A domain owns its fragment files; the aggregator only spreads or intersects them, and a `satisfies` / mapped type makes a missing entry a compile error.

| Fragment (per domain) | Aggregator | Joined by |
| --- | --- | --- |
| `domain/{d}/errorCode.ts` | `domain/businessErrorCode.ts` | `BusinessErrorCode` union |
| `apps/web/app/presentation/errorCatalog/{d}.ts` | `apps/web/app/presentation/businessErrorCatalog.ts` | spread, `satisfies Record<BusinessErrorCode, …>` |
| `domain/{d}/ports/unitOfWork.ts` | `application/execution/unitOfWork.ts` | `UnitOfWorkRepositories` intersection |
| `application/{d}/services.ts` | `application/di/types.ts` | `RequestContainer` intersection |
| `application/di/{d}.ts` | `application/di/container.ts` | `LuntEnv` intersection + `...create{D}Services(env, deps)` |
| `application/{d}/eventDecoders.ts` | `application/events/registry.ts` | `LuntDomainEvent` union + `eventDecoders` spread |
| consumers (in `application/{d}/`) | `application/events/consumers.ts` | `consumers` |
| daily jobs (in `application/{d}/`) | `application/workers/dailyJobRegistry.ts` | `dailyJobs` array |
| `adapters/do/protocol/{d}.ts` | `adapters/do/protocol/queries.ts`, `adapters/do/protocol/commands.ts` | `QueryCatalog` intersection, `WriteCommand` union |
| `adapters/do/store/{d}.ts` | `adapters/do/store/queries.ts`, `adapters/do/store/commands.ts`, `adapters/do/store/schema.ts` | handler spreads `satisfies`, `MIGRATIONS` |
| `adapters/do/repositories/{d}.ts` | `adapters/do/repositories/index.ts` | `createRepositories` spread |
| `application/{d}/__tests__/testServices.ts` | `application/__tests__/testContainer.ts` | `...createTest{D}Services(deps)` |

### Adding a new domain: checklist

A domain starts with every fragment in place and empty, the way Notification's were scaffolded before its stage (`domain/notification/ports/unitOfWork.ts`, `application/notification/services.ts`, `application/di/notification.ts`, `adapters/do/protocol/notification.ts`, `adapters/do/store/notification.ts`, `adapters/do/repositories/notification.ts`, `application/notification/__tests__/testServices.ts`, `apps/web/app/presentation/errorCatalog/notification.ts`).

```ts
// domain/notification/ports/unitOfWork.ts
export type NotificationRepositories = Readonly<Record<never, never>>;

// adapters/do/protocol/notification.ts
export type NotificationQueries = Record<never, QuerySpec<unknown, unknown>>;
export type NotificationCommand = never;

// adapters/do/store/notification.ts
export const NOTIFICATION_MIGRATIONS: readonly Migration[] = [];
export const notificationQueryHandlers: QueryHandlersOf<NotificationQueries> = {};
export const notificationCommandHandlers: CommandHandlersOf<NotificationCommand> = {};
```

1. Domain: `domain/{d}/errorCode.ts` (`{D}_…` codes, `as const`) → add the type to `BusinessErrorCode` in `domain/businessErrorCode.ts`; add `errorCatalog/{d}.ts` (`satisfies Record<{D}ErrorCode, BusinessErrorPresentation>`) and spread it in `businessErrorCatalog.ts`.
2. Ports: `domain/{d}/ports/unitOfWork.ts` (`{D}Repositories`) → intersect it into `UnitOfWorkRepositories`.
3. Container: `application/{d}/services.ts` (`{D}Services`) → intersect into `RequestContainer`; `application/di/{d}.ts` (`{D}Env`, `create{D}Services`) → intersect `{D}Env` into `LuntEnv` and spread the call in `createRequestContainer`; `application/{d}/__tests__/testServices.ts` → spread in `createTestContainer`.
4. Store: `adapters/do/protocol/{d}.ts` (`{D}Queries`, `{D}Command`) → add to `QueryCatalog` / `WriteCommand`; `adapters/do/store/{d}.ts` → spread handlers in `store/queries.ts` / `store/commands.ts` and `...{D}_MIGRATIONS` in `MIGRATIONS`; `adapters/do/repositories/{d}.ts` → spread in `createRepositories`.
5. Migration versions are global, not per domain: reserve the next free number (the list is in the `MIGRATIONS` JSDoc: 1 core, 2 accounts, 3 dead letters, 4 login challenges, 5 authority, 6 application, 7 notification, 8 development mailbox — the next free one is 9) and add it to that JSDoc. `applyMigrations` runs every version an object has not recorded, lowest first, so a reserved lower number that lands after a higher one still runs; a migration may therefore depend only on versions below it. Never edit an applied migration.
6. Events (when the domain has any): `domain/{d}/events.ts`, `application/{d}/eventDecoders.ts` → add to `LuntDomainEvent` and `eventDecoders`; give every event type at least one consumer (compile-time check in `application/events/consumers.ts`).
7. Daily jobs: append to `dailyJobs` in `application/workers/dailyJobRegistry.ts`.
8. Tests: a conformance suite per new port plus its two runners (section 6).

## 2. Domain layer

No I/O, no clock, no id generation: functions take `now: Date` and caller-minted ids.

### Value objects and ids

A brand plus a namespace object with `create` as the only way in; invalid input throws `BusinessRuleError` with a `COMMON_…` or domain code.

```ts
// domain/common/emailAddress.ts
export type EmailAddress = string & { readonly [emailAddressBrand]: true };

export const EmailAddress = {
  maxLength: 254,
  create: (raw: string): EmailAddress => {
    const value = raw.trim().toLowerCase();
    if (value.length > EmailAddress.maxLength || !EMAIL_PATTERN.test(value)) {
      throw new BusinessRuleError(CommonErrorCode.InvalidEmailAddress, "Invalid email address");
    }
    return value as EmailAddress;
  },
  equals: (a: EmailAddress, b: EmailAddress): boolean => a === b,
};
```

Aggregate ids share one tagged brand (`domain/common/ids.ts`): `Id<"AccountId">`, `Id<"InvitationId">`, … are mutually non-assignable, and each has `create` rejecting only blank strings. The format (UUIDv7) belongs to the `IdGenerator` port (`application/ports/idGenerator.ts`): adapters check `idGenerator.parse(id)` on rehydration, transports parse caller-minted ids into `GeneratedId` (`parseGeneratedId` in `apps/web/app/presentation/validator.ts`). `domain/common/ids.ts` holds the ids other domains refer to; an id used only inside its own domain gets its brand next to its entity (`LoginChallengeId` in `domain/account/loginChallenge.ts`).

Other shared-kernel pieces to reuse before writing new ones: `Version` (`domain/common/version.ts`), `StewardedRef` / `ContentRef` (`domain/common/refs.ts`), `Pagination` (`domain/common/pagination.ts`), `IdBatch` (`domain/common/idBatch.ts`, the 100-id limit).

### Entities: immutable data + a namespace of pure functions

An aggregate is a `Readonly` type — a discriminated union when it has states — and a same-named `const` holding the functions. Transitions take the narrowest state that allows them, so an illegal transition is a type error, and return a new value with `Version.next`.

```ts
// domain/account/loginChallenge.ts
export type PendingLoginChallenge = LoginChallengeBase &
  Readonly<{ status: "pending"; failedCodeAttempts: number }>;
export type RedeemedLoginChallenge = LoginChallengeBase & Readonly<{ status: "redeemed" }>;
export type ExhaustedLoginChallenge = LoginChallengeBase & Readonly<{ status: "exhausted" }>;
export type LoginChallenge =
  | PendingLoginChallenge
  | RedeemedLoginChallenge
  | ExhaustedLoginChallenge;

/** A mismatch is not thrown: the usecase saves `challenge`, commits, then throws `error`. */
export type CodeRedemption =
  | Readonly<{ outcome: "redeemed"; challenge: RedeemedLoginChallenge }>
  | Readonly<{
      outcome: "mismatch";
      challenge: PendingLoginChallenge | ExhaustedLoginChallenge;
      error: BusinessRuleError<AccountErrorCode>;
    }>;

function issue(params: Readonly<{ id: LoginChallengeId; email: EmailAddress; /* … */ validForMs: number }>, now: Date): PendingLoginChallenge {
  // …
  return { /* … */ expiresAt: new Date(now.getTime() + params.validForMs), version: Version.initial(), status: "pending", failedCodeAttempts: 0 };
}

export const LoginChallenge = { issue, redeemByLink, redeemByCode, isReplayOf, reconstruct, snapshot };
```

- A result that must be persisted even when the operation "fails" is returned as data (`CodeRedemption`), not thrown — see `completeLoginByCode` below.
- A transition that emits events returns `WithEventDrafts<Entity, Event>` (`domain/common/event.ts`); drafts have no id — the unit of work mints it.

```ts
// domain/authority/stewardship.ts
export type StewardedStewardship = StewardshipBase &
  Readonly<{ status: "stewarded"; stewards: readonly [Steward, ...Steward[]] }>;
export type VacantStewardship = StewardshipBase & Readonly<{ status: "vacant" }>;
export type Stewardship = StewardedStewardship | VacantStewardship;

/** A stewardship whose target is known to be `T`. */
export type StewardshipOf<T extends StewardedRef> = Stewardship & Readonly<{ target: T }>;

/** An operator's grant on a region or occasion; places are refused by type. */
function grant<T extends GrantableRef>(s: StewardshipOf<T>, appointee: Appointee, now: Date): Result<T> {
  return appoint(s, appointee, "grant", now);
}

function removeSteward<T extends StewardedRef>(s: StewardshipOf<T>, accountId: AccountId, reason: StewardRemovalReason, now: Date): Result<T> {
  const verdict = removal(s, accountId);
  // …
  if (verdict.vacates) {
    return {
      entity: { target: s.target, status: "vacant", invitations: s.invitations, version },
      eventDrafts: [removed, AuthorityEvents.stewardshipVacated(s.target, now)],
    };
  }
  // …
}
```

Patterns worth copying from these two files:

- Non-empty tuples (`readonly [Steward, ...Steward[]]`) instead of a runtime "at least one" check; `RoleRoster` (`domain/authority/roleRoster.ts`) does the same for an established operator roster, which has no empty state at all.
- An aggregate that "exists" before anything is stored gets a default value instead of `null`: `Stewardship.vacant(target)` / `Stewardship.orVacant(stored, target)`, `RoleRoster.initial(role)`.
- One function decides each rule and is reused by every caller: `Stewardship.removal` serves resignation, revocation, withdrawal and the withdrawal preview; `RoleRoster.removal` likewise.
- Idempotent-create checks live on the entity: `LoginChallenge.isReplayOf`, `Stewardship.classifyInvite` (`"new" | "replay" | "conflict"`).
- An operation with no successor entity drafts its events without one: `Account.withdraw(account, now)` returns drafts only; the usecase deletes the account.

### Rehydration: `reconstruct` + `RehydrationError`

`reconstruct` takes the at-rest snapshot (primitives), rebuilds every value object and re-checks every invariant, and wraps any failure in `RehydrationError`. Adapters turn that into `SystemError(DATA_INTEGRITY_ERROR)`; it is never a user error.

```ts
// domain/authority/stewardship.ts
function reconstruct(input: StewardshipSnapshot): Stewardship {
  try {
    if (!StewardedRef.isKind(input.target.kind)) throw new Error(`Unknown target kind: ${input.target.kind}`);
    // … value objects, normalized-form checks, no duplicates …
    const [first, ...rest] = stewards;
    if (input.status === "vacant" && first === undefined) return { target, status: "vacant", invitations, version };
    if (input.status === "stewarded" && first !== undefined) return { target, status: "stewarded", stewards: [first, ...rest], invitations, version };
    throw new Error(`Status ${input.status} does not match ${stewards.length} stewards`);
  } catch (error) {
    throw new RehydrationError("Stored stewardship violates invariants", error);
  }
}
```

`LoginChallenge.snapshot` is the inverse the adapter writes with; keep the pair together in the entity file.

### Domain events

Event types are `DomainEventBase<type, payload>`; the factories return `EventDraft`s. `aggregateId` is the aggregate's key as a string (`"<kind>:<id>"` for a stewardship, the role for a roster).

```ts
// domain/authority/events.ts
export type StewardAppointedEvent = DomainEventBase<
  "authority.steward_appointed",
  { target: StewardedRef; accountId: AccountId; via: AppointmentVia }
>;

export type AuthorityEvent = InvitationIssuedEvent | StewardAppointedEvent | StewardRemovedEvent | StewardshipVacatedEvent | RoleGrantedEvent | RoleRevokedEvent;

export const AuthorityEvents = {
  stewardAppointed: (target: StewardedRef, accountId: AccountId, via: AppointmentVia, now: Date): EventDraft<StewardAppointedEvent> => ({
    type: "authority.steward_appointed",
    payload: { target, accountId, via },
    occurredAt: now,
    aggregateId: targetKey(target),
  }),
  // …
};
```

Name types `{domain}.{past_tense}`. Consumers must not trust the payload as current state — delivery is unordered — so keep payloads to keys and the facts of the change.

### Policies

A rule that spans aggregates, or that several usecases share, is a pure function over data the usecase reads. `AccessPolicy.decide` (`domain/authority/accessPolicy.ts`) is the only place authorization rules live; it never throws and returns a decision the application turns into `ForbiddenError`.

```ts
export type Operation =
  | Readonly<{ kind: TargetOperationKind; standing: TargetStanding }>
  | Readonly<{ kind: RoleOperationKind }>;

export type AccessDecision =
  | Readonly<{ allowed: true; basis: AccessBasis }>
  | Readonly<{ allowed: false }>;

function decide(authority: ActorAuthority, operation: Operation): AccessDecision {
  switch (operation.kind) {
    case "operate_service":
      return authority.roles.has("operator") ? allow("role") : DENY;
    case "edit_articles":
      return authority.roles.has("editor") ? allow("role") : DENY;
    default:
      return decideOnTarget(operation.kind, operation.standing, authority.roles);
  }
}

export const AccessPolicy = { decide };
```

### Ports

Repository ports start from `TransactionalRepository<TEntity, TId>` (`domain/common/transactionalRepository.ts`): `insert`, `findById` returning `Versioned<T>` (entity + `ExpectedVersion<T>` token), and `save` / `delete` that require the token. Drop what the aggregate never does with `Omit`, add queries, and write the contract (errors, limits, ordering) in the JSDoc — the conformance suite tests exactly that.

```ts
// domain/authority/ports/stewardshipRepository.ts
/**
 * - `insert`: `ConflictError` when the target already has one.
 * - `findById`: `null` when none is stored — read it as `Stewardship.vacant(target)`.
 * - `save`: `ConflictError` on a version mismatch, `NotFoundError` when none is stored.
 * - `findByTargets`: 0–100 targets (`COMMON_INVALID_INPUT` above), stored ones only, in no particular order.
 * …
 */
export interface StewardshipRepository
  extends Omit<TransactionalRepository<Stewardship, StewardedRef>, "delete"> {
  findByTargets(targets: readonly StewardedRef[]): Promise<readonly Stewardship[]>;
  findPageBySteward(accountId: AccountId, pagination: Pagination): Promise<PaginationResult<Versioned<Stewardship>>>;
}
```

- A fixed-key aggregate need not follow the base shape: `RoleRosterRepository.find(role)` never returns `null` (`domain/authority/ports/roleRosterRepository.ts`).
- Bulk maintenance is its own method: `LoginChallengeRepository.deleteClosedBefore(threshold)` (`domain/account/ports/loginChallengeRepository.ts`).
- The domain's repositories are exposed only through the unit of work:

```ts
// domain/authority/ports/unitOfWork.ts
export type AuthorityRepositories = Readonly<{
  stewardshipRepository: StewardshipRepository;
  roleRosterRepository: RoleRosterRepository;
}>;
```

- Read-only ports that never join a unit of work (`StewardedTargetDirectory`, `domain/authority/ports/stewardedTargetDirectory.ts`) and external I/O ports (`LoginMailSender`, `LoginSecretGenerator`, `ExternalIdentityVerifier` in `domain/account/ports/`) live on the container via `application/{d}/services.ts`.

### Errors and codes

```ts
// domain/authority/errorCode.ts
export const AuthorityErrorCode = {
  AlreadySteward: "AUTHORITY_ALREADY_STEWARD",
  InvitationAlreadyPending: "AUTHORITY_INVITATION_ALREADY_PENDING",
  // …
  LastOperator: "AUTHORITY_LAST_OPERATOR",
} as const;
export type AuthorityErrorCode = (typeof AuthorityErrorCode)[keyof typeof AuthorityErrorCode];
```

Throw `new BusinessRuleError(AuthorityErrorCode.AlreadySteward, "…")`; `BusinessRuleError<TCode>` defaults to `never`, so the code must be a literal of some domain's union. Shared-kernel codes are in `domain/common/errorCode.ts` (`CommonErrorCode`, plus `SubjectErrorCode` for codes raised under the caller's prefix). A new code does not compile until it has an entry in `apps/web/app/presentation/errorCatalog/{d}.ts`.

## 3. Application layer

### Usecase shape

```ts
// application/types.ts
export type ServiceArgs<T> = { container: RequestContainer; input: T };
export type ActorServiceArgs<T> = ServiceArgs<T> & Readonly<{ actor: Actor }>;
```

One exported async function per file, named after the spec usecase, with a JSDoc that lists the screen ids, the events and the errors. Build value objects from `input` first (the second validation point), then do every read and write of one decision inside one `run`.

```ts
// application/authority/grantRole.ts
export type GrantRoleInput = Readonly<{ role: Role; email: string }>;

export async function grantRole({ container, actor, input }: ActorServiceArgs<GrantRoleInput>): Promise<void> {
  const email = EmailAddress.create(input.email);
  await container.unitOfWorkProvider.run(async (ctx) => {
    await authorizeRole(ctx, actor, "operate_service");
    const grantee = await requireAccountByEmail(ctx.accountRepository, email);
    const roster = await ctx.roleRosterRepository.find(input.role);
    const { entity, eventDrafts } = RoleRoster.grant(roster.entity, grantee.entity.id, container.clock.now());
    await ctx.roleRosterRepository.save(entity, roster.expectedVersion);
    await ctx.accountRepository.save(Account.markReferenced(grantee.entity), grantee.expectedVersion);
    ctx.collectEvents(eventDrafts);
  });
}
```

`Account.markReferenced` bumps the account's version in the same unit of work, so a grant and a concurrent withdrawal race on one optimistic lock and only one commits — the pattern for "an aggregate now points at another one that may be deleted".

### Unit of work

`UnitOfWorkProvider.run(fn)` (`application/execution/unitOfWork.ts`, implemented by `adapters/do/unitOfWork.ts`):

- Reads (`findById`, queries) go to the state object immediately.
- Writes (`insert`, `save`, `delete`) and `collectEvents(drafts)` are buffered and committed together in one transaction after `fn` resolves. A scope therefore never sees its own writes: read everything first, then write.
- `ConflictError` (version mismatch, taken unique key) and `NotFoundError` (`save` / `delete` of a missing row) surface at commit. Nothing is retried; the caller may resend.
- A throw inside `fn` discards the buffer. A scope with no writes and no events commits nothing, so a read-only `run` is cheap.
- One scope may span domains: `withdraw` (`application/account/withdraw.ts`) deletes the account and, through `removeAllAuthorityOf(ctx, …)` (`application/authority/withdrawal.ts`), updates every stewardship and roster in the same commit. Cross-domain helpers take the narrowest repositories type they need (`AuthorityRepositories`, `Pick<…>`), not the whole context.

### Idempotent create with a caller-minted id

The caller mints the id (`GeneratedId`) and resends it unchanged; the usecase answers "same id, same content" as a success without writing, and "same id, other content" as `ConflictError`.

```ts
// application/authority/inviteMember.ts
const params = { invitationId, email };
switch (Stewardship.classifyInvite(stewardship, params)) {
  case "replay":
    return;
  case "conflict":
    throw new ConflictError("INVITATION_ID_CONFLICT", "The invitation id is already used for another email address");
  case "new":
    break;
}
```

When a side effect sits between the check and the write, split the work into two scopes and re-check in the second — a failed send stores nothing, and a stored challenge always had its mail accepted:

```ts
// application/account/startEmailLogin.ts
const found = await container.unitOfWorkProvider.run(({ loginChallengeRepository }) =>
  loginChallengeRepository.findById(id),
);
if (judge(found, email) === "replay") return;

const { linkToken, code } = await secrets.generate();
// … digests …
await container.loginMailSender.send({ to: email, linkToken, code });

await container.unitOfWorkProvider.run(async ({ loginChallengeRepository }) => {
  const stored = await loginChallengeRepository.findById(id);
  if (judge(stored, email) === "replay") return;
  await loginChallengeRepository.insert(LoginChallenge.issue({ id, email, linkTokenDigest, codeDigest, validForMs: container.loginSettings.challengeValidForMs }, now));
});
```

### Persist, then throw

When a failed attempt must be recorded (attempt counters), let the scope return the error as data and throw it after `run` has committed:

```ts
// application/account/completeLoginByCode.ts
const settled = await container.unitOfWorkProvider.run(async ({ loginChallengeRepository, accountRepository }): Promise<Settled> => {
  // …
  if (redemption.outcome === "mismatch") {
    await loginChallengeRepository.save(redemption.challenge, expected);
    return { kind: "mismatch", error: redemption.error };
  }
  // …
});
if (settled.kind === "mismatch") throw settled.error;
return settled.result;
```

### Access checks

`application/authority/access.ts` turns `AccessPolicy` into calls made inside the same `run` as the writes, before them, so a revocation committed first is seen:

- `authorizeRole(ctx, actor, "operate_service")` for role-only operations.
- `authorizeOnTarget(ctx, actor, "invite_member", target)` reads roles and the stewardship (vacant when none is stored) and returns `{ stewardship, expectedVersion, standing, basis }`; `expectedVersion` is `null` for a target with nothing stored.
- `persistStewardship(ctx, entity, expectedVersion)` then `insert`s or `save`s accordingly.
- Both throw `ForbiddenError("FORBIDDEN")`; usecases never branch on `basis`.
- Both also record, through `ctx.accessGuard` (`domain/authority/ports/accessGuard.ts`), the facts the decision rested on — the role, the stewardship, the vacancy of an absence proxy's target. The object checks them again at commit (`protocol/conditions.ts`), so a revocation committed after the read but before the commit refuses the unit of work with `ForbiddenError` (`spec/usecases/authority.md` 「確定までの間に役割を解除された場合を含む」). A later domain that decides access the same way (e.g. `act_as_place`) gets this by calling these helpers; a condition of its own is one more member of `CommitCondition` and one handler in `store/conditions.ts`.

### Application errors

`application/errors.ts`: `NotFoundError`, `ConflictError`, `UnauthorizedError`, `ForbiddenError` (free-string codes, e.g. `LOGIN_CHALLENGE_ID_CONFLICT`, exported as a constant when the presentation needs it) and `SystemError` with `SystemErrorCode` (`DATABASE_ERROR` from a failing store call, `DATA_INTEGRITY_ERROR` from bad stored data, `NETWORK_ERROR` / `EXTERNAL_API_ERROR` — the retryable ones — from external adapters such as `adapters/identity/googleOidc.ts`). Domain `BusinessRuleError`s pass through usecases untouched.

### Event decoders

The relay rehydrates outbox rows through a decoder per event type. `buildEventDecoder(type, schema, rehydrate)` does the shape check (`.strict()` zod) and the `SystemError(DATA_INTEGRITY_ERROR)` on mismatch; the domain supplies the rehydration of branded values, wrapped so a failing value object is also integrity, not a user error.

```ts
// application/authority/eventDecoders.ts
type AuthorityEventDecoders = {
  readonly [K in AuthorityEvent["type"]]: EventDecoder<Extract<AuthorityEvent, { type: K }>>;
};

export const authorityEventDecoders: AuthorityEventDecoders = {
  "authority.role_granted": buildEventDecoder(
    "authority.role_granted",
    z.object({ role: roleSchema, accountId: z.string() }).strict(),
    intact((p) => ({ role: p.role, accountId: AccountId.create(p.accountId) })),
  ),
  // …
};
```

```ts
// application/events/registry.ts
export type LuntDomainEvent = AccountEvent | AuthorityEvent;

export const eventDecoders = {
  ...accountEventDecoders,
  ...authorityEventDecoders,
} satisfies DefaultEventDecoderRegistry;
```

### Consumers

A consumer is a usecase subscribed to event types, registered by name in `application/events/consumers.ts`. The name keys the queue message and the consumer's receipts, so renaming one is a data migration. Consumers must be idempotent on their own (receipts only save a repeat) and read current state rather than trusting event order.

```ts
// application/events/consumers.ts — registering one
export const consumers = {
  purgeNotificationsOnWithdrawal: defineConsumer(["account.withdrawn"], async (container, event) => {
    // … event is narrowed to AccountWithdrawnEvent; run the usecase with `container`
  }),
} satisfies Readonly<Record<string, EventConsumer>>;
```

Every event type needs at least one subscriber: `EveryEventSubscribed<typeof consumers>` must be `true`, or the file does not compile and the error names the event types without a consumer (`UnsubscribedEventType`). The relay fails and retries an event no registered consumer subscribes to.

### Daily jobs

A `DailyJob` (`application/workers/dailyJobs.ts`) picks its targets from stored state and the run's single `now`, so re-running it is safe. Register it in `dailyJobs` (`application/workers/dailyJobRegistry.ts`); `runDailyJobs` runs them independently from the Worker's `scheduled` handler.

- One bulk statement needs no paging: `purgeClosedLoginChallengesJob` (`application/account/purgeClosedLoginChallenges.ts`) is one `run` calling `deleteClosedBefore(now)`.
- Per-target work goes through `drainPages`: each target in its own unit of work, one failure does not stop the run, a target is tried at most once per run. The integration test shows the shape:

```ts
// apps/web/app/durable-objects/__tests__/luntState.integration.test.ts
run: (c) =>
  drainPages<Account>({
    job: "deleteEveryAccount",
    logger: c.logger,
    keyOf: (account) => account.id,
    readPage: (page) => c.unitOfWorkProvider.run(async ({ accountRepository }) => /* page `page` of the remaining targets */),
    process: (account) => c.unitOfWorkProvider.run(async ({ accountRepository }) => { /* re-read, then write */ }),
  }),
```

`readPage` must select only targets still to be processed (processed ones drop out), because `drainPages` returns to page 1 after every productive page.

### Container wiring and environment

```ts
// application/di/types.ts
export type RequestContainer = SharedDeps &
  Readonly<{ config: AppConfig; runtime: RuntimeSettings; unitOfWorkProvider: UnitOfWorkProvider }> &
  AccountServices &
  AuthorityServices &
  ApplicationServices &
  NotificationServices;
```

`RequestContainer` serves HTTP requests, queue consumers and daily jobs alike; `WorkerContainer` is the relay's, inside the object's alarm. Each domain's `create{D}Services(env, deps)` receives `ServiceDeps` (`client`, `shared`, `runtime`, `presentation`) and parses its own env with zod:

```ts
// application/di/account.ts
export type AccountEnv = MailEnv & Readonly<{ APP_URL: string; EXTERNAL_IDP?: string | undefined; /* … */ LOGIN_MAX_CODE_ATTEMPTS?: string | undefined }>;

export function createAccountServices(env: AccountEnv, deps: ServiceDeps): AccountServices {
  const loginSettings = readLoginSettings(env);
  const mail = createMailTransport(readMailSettings(env, deps.runtime.devTools), deps);
  // …
  return {
    loginSettings,
    loginSecretGenerator: new WebCryptoLoginSecretGenerator(deps.runtime.sessionSecret),
    loginMailSender: new MailLoginMailSender(mail.transport, { /* … */ }),
    // …
  };
}
```

- Env values are optional strings with defaults for development; a development-only adapter (`EXTERNAL_IDP=fake`, `MAIL_TRANSPORT=devInbox`) throws at wiring unless `DEV_TOOLS=1`.
- A setting shared by several domains gets its own module: `application/di/mail.ts` (`MailEnv`, `readMailSettings`, `createMailTransport`) chooses one `MailTransport` per deployment for Account's login mail and, later, Notification's mail.
- A domain with nothing to wire still has its fragment (`AuthorityEnv = Readonly<Record<never, never>>`).

## 4. Adapters: the Durable Object

### RPC protocol

The request side talks to one `LuntStateObject` through `LuntStateClient` (`adapters/do/protocol/client.ts`):

- `query(name, args)` — a named, typed read.
- `commit({ writes, events })` — one unit of work; the object applies every command and inserts the outbox rows in one `transactionSync` (`adapters/do/store/stateStore.ts`), and returns `committed` or `rejected` with the first `WriteFailure`.

Workers RPC loses error classes, so every outcome a port names travels as data. `DoUnitOfWorkProvider` rethrows a rejection as `ConflictError` / `NotFoundError`; `mapDoError` (`adapters/do/helpers.ts`) turns anything else thrown into `SystemError(DATABASE_ERROR)`. Arguments and results are structured-clonable plain data (records, not entities).

### Protocol fragment

```ts
// adapters/do/protocol/authority.ts
export type StewardshipRecord = Readonly<{
  target: TargetRecord;
  status: string;
  stewards: readonly Readonly<{ accountId: string; since: Date }>[];
  invitations: readonly Readonly<{ id: string; email: string; invitedAt: Date }>[];
  version: number;
}>;

export type AuthorityQueries = {
  "authority.findStewardship": QuerySpec<{ target: TargetRecord }, StewardshipRecord | null>;
  /** Stored stewardships among `targets` (at most 100). */
  "authority.findStewardshipsByTargets": QuerySpec<{ targets: readonly TargetRecord[] }, readonly StewardshipRecord[]>;
  // …
};

export type AuthorityCommand =
  | Readonly<{ kind: "authority.insertStewardship"; record: StewardshipRecord }>
  | Readonly<{ kind: "authority.saveStewardship"; record: StewardshipRecord; expectedVersion: number }>
  | Readonly<{ kind: "authority.saveRoleRoster"; record: RoleRosterRecord; expectedVersion: number | null }>;
```

Names are `{domain}.{operation}`. Commands carry the whole aggregate snapshot; derived columns and reverse indexes are computed by the handler from it.

### Store fragment

Migrations and one synchronous handler per query name and command kind. The fragment annotates its tables with `QueryHandlersOf<…>` / `CommandHandlersOf<…>`; the aggregators (`store/queries.ts`, `store/commands.ts`) spread them `satisfies QueryHandlers` / `CommandHandlers`, so a catalog entry without a handler does not compile.

```ts
// adapters/do/store/authority.ts
const AUTHORITY_TABLES_MIGRATION: Migration = {
  version: 5,
  name: "stewardships and role rosters",
  statements: [
    `CREATE TABLE stewardships (target_kind TEXT NOT NULL, target_id TEXT NOT NULL, status TEXT NOT NULL, stewards TEXT NOT NULL, invitations TEXT NOT NULL, version INTEGER NOT NULL, PRIMARY KEY (target_kind, target_id))`,
    // Reverse index of stewards, rebuilt from the snapshot on every write.
    `CREATE TABLE stewardship_stewards ( /* … */ )`,
    // …
  ],
};
export const AUTHORITY_MIGRATIONS: readonly Migration[] = [AUTHORITY_TABLES_MIGRATION];

export const authorityCommandHandlers: CommandHandlersOf<AuthorityCommand> = {
  "authority.saveStewardship": (sql, { record, expectedVersion }) =>
    afterApplied(
      updateVersioned(sql, "stewardships", { target_kind: record.target.kind, target_id: record.target.id }, stewardshipValues(record), expectedVersion, describeTarget(record.target)),
      () => indexStewards(sql, record),
    ),
  // …
};
```

Store child collections of an aggregate as JSON in its row (dates as epoch ms) and add a reverse-index table only for a lookup the port needs (`findPageBySteward`, `findRolesOf`).

### Versioned writes

`adapters/do/store/versioned.ts` returns outcomes as data, which `StateStore.commit` turns into a rollback plus `rejected`:

| Helper | Outcome |
| --- | --- |
| `insertUnique(sql, table, row, describe)` | `ON CONFLICT DO NOTHING`; any unique key taken → `conflict` / `UNIQUE_VIOLATION` |
| `updateVersioned(sql, table, key, values, expectedVersion, describe)` | `WHERE version = ?`; missing row → `notFound`, stale → `conflict` / `OPTIMISTIC_LOCK_FAILURE`, unique clash → `UNIQUE_VIOLATION` |
| `deleteVersioned(sql, table, key, expectedVersion, describe)` | same split as update |

A "save if absent" for a fixed-key aggregate is `insertUnique` when `expectedVersion` is `null` (`authority.saveRoleRoster`). Never upsert — it would hide a lost update.

### Request-side repository

One class per port in `adapters/do/repositories/`, constructed per unit of work by the domain's `create{D}Repositories(deps)` with the shared write buffer:

```ts
// adapters/do/repositories/stewardshipRepository.ts
export class DoStewardshipRepository implements StewardshipRepository {
  constructor(private readonly client: LuntStateClient, private readonly writes: WriteCommand[], private readonly idGenerator: IdGenerator) {}

  private toStewardship(record: StewardshipRecord): Stewardship {
    const malformed = ids.find((id) => this.idGenerator.parse(id) === null);
    if (malformed !== undefined) throw new SystemError(SystemErrorCode.DataIntegrityError, `Stored stewardship has malformed id: ${malformed}`);
    try {
      return Stewardship.reconstruct(record);
    } catch (error) {
      if (isRehydrationError(error)) throw new SystemError(SystemErrorCode.DataIntegrityError, "Stored stewardship violates invariants", error);
      throw error;
    }
  }

  findById(target: StewardedRef): Promise<Versioned<Stewardship> | null> {
    return mapDoError("Failed to find stewardship", async () => {
      const record = await this.client.query("authority.findStewardship", { target: { kind: target.kind, id: target.id } });
      return record === null ? null : this.toVersioned(record);
    });
  }

  async findByTargets(targets: readonly StewardedRef[]): Promise<readonly Stewardship[]> {
    IdBatch.assertWithinLimit(targets);
    // …
  }

  async save(stewardship: Stewardship, expectedVersion: ExpectedVersion<Stewardship>): Promise<void> {
    this.writes.push({ kind: "authority.saveStewardship", record: DoStewardshipRepository.toRecord(stewardship), expectedVersion });
  }
}
```

- Reads: `mapDoError` + `client.query`, then `idGenerator.parse` on every stored id and `reconstruct`, both failing as `DATA_INTEGRITY_ERROR`. `toVersioned` is the only place an `ExpectedVersion` is cast.
- Writes: push a command; nothing is sent until commit.
- `DoLoginChallengeRepository` (`adapters/do/repositories/loginChallengeRepository.ts`) is the same shape with `LoginChallenge.snapshot` for the record.

### SQLite limits in the object

- At most 100 bound parameters per statement: ports cap id lists at 100 (`IdBatch.assertWithinLimit`, before any query), and handlers pass the list as one JSON parameter — `FROM json_each(?) j JOIN stewardships s ON s.target_kind = json_extract(j.value, '$.kind') …`, `INSERT … SELECT value, ? FROM json_each(?)`.
- No `BEGIN` / `SAVEPOINT`: atomicity comes from `transactionSync` around the whole commit; handlers just run statements.
- Keep `LIKE` patterns short; match text with the domain's own normalization instead.
- `adapters/do/testing/nodeSqlStorage.ts` reproduces these limits in the Node pool.

### Kind-pluggable lookups

`StewardedTargetDirectory` answers for places, regions and occasions, whose tables their own domains own. The object-side read (`describeStewardedTargets` in `adapters/do/store/stewardedTargetLookups.ts`) groups the targets by kind and asks one `StewardedTargetLookup` per kind; a kind joins by adding its entry to `STEWARDED_TARGET_LOOKUPS` (a kind without an entry has no targets). The request side is `DoStewardedTargetDirectory` (`adapters/do/stewardedTargetDirectory.ts`), a container-level read-only port wired in `application/di/authority.ts`. Use the same shape whenever a port has to span aggregates that other domains own.

### External adapters

- `adapters/mail/`: `MailTransport` (`adapters/mail/transport.ts`) with `SmtpMailTransport` and the development inbox (`DevInboxMailTransport` storing into the object, `DoDevInbox` reading it). Domain-specific senders render and hand over to the transport.
- `adapters/login/`: `MailLoginMailSender` (renders the login mail; the secrets never reach the outbox or logs), `WebCryptoLoginSecretGenerator`.
- `adapters/identity/`: `ExternalIdentityProviders` (the registry implementing `ExternalIdentityVerifier` and `ExternalLoginStarter`), `GoogleOidcProvider`, `FakeIdpProvider`, and `FakeIdpScreen` (the development provider's side, behind the application port `FakeIdp` in `application/dev/fakeIdp.ts`, so the `/__dev/idp/authorize` screen reaches it through usecases like any other).
- Domain ports get a conformance suite beside their adapter (`adapters/login/__conformance__/`, `adapters/identity/__conformance__/`); test doubles for external I/O live under `testing/` (`InMemoryMailTransport` in `adapters/mail/testing/inMemoryMailTransport.ts`, `adapters/identity/testing/fakeIdpFlow.ts`).

## 5. Outbox, relay, consumers, dead letters

`collectEvents` drafts become outbox rows in the same transaction as the writes. The object's alarm runs `processOutboxEvents` (`application/workers/eventRelayWorker.ts`, via `adapters/do/alarm.ts`), and `createFanOutDispatcher` (`application/workers/eventDelivery.ts`) sends one queue message per subscribed consumer. The Worker's `queue` handler (`apps/web/app/worker/queue.ts`) runs `consumeEventMessage`: skip if the consumer's receipt exists, handle, then record the receipt. Exhausted messages land in the dead-letter queue and are stored in the object for an operator to re-drive through `/__ops/dead-letters` (`apps/web/app/worker/ops.ts`).

What this means for new code — at-least-once, unordered, per-consumer retry — is in `AGENTS.md` (Outbox / domain events); the operational side (backoff, alerts, re-drive procedure, relay kick) is in `docs/runtime_cloudflare_do.md`.

## 6. Tests

Layers, pools and rules are in `docs/test.md`. The patterns:

### Port conformance: one suite, two runners

```ts
// adapters/do/__conformance__/stewardshipRepository.ts — the suite, written once
export function describeStewardshipRepositoryContract(makeHarness: HarnessFactory): void {
  describe("StewardshipRepository contract", () => {
    describe("insert、findById", () => {
      it("stewardshipRepository#2 空 / findById(P1)", async () => {
        const h = await makeHarness();
        expect(await findStewardship(h, authorityIds().place())).toBeNull();
      });
      // …
    });
  });
}
```

```ts
// adapters/do/__tests__/stewardshipRepository.conformance.test.ts — Node pool, node:sqlite
describeStewardshipRepositoryContract(async () => createNodeHarness());
```

```ts
// apps/web/app/durable-objects/__tests__/stewardshipRepository.conformance.integration.test.ts — Workers pool, the real object
describeStewardshipRepositoryContract(createDoHarness);
```

A `ConformanceHarness` (`adapters/do/__conformance__/harness.ts`) is a fresh store's `uow` plus `savedEvents()`; build fixtures through the port, never with SQL (`adapters/do/__conformance__/authorityFixtures.ts`).

### Usecase tests

`createTestContainer` (`application/__tests__/testContainer.ts`) is a production-shaped `RequestContainer`: the real `DoUnitOfWorkProvider` and repositories over the object's store code on in-memory `node:sqlite`, `FakeClock`, `FakeIdGenerator`, and fakes only for external I/O from each domain's `createTest{D}Services`. Replace a member with `overrides`; `storedEvents()` reads the outbox.

```ts
// application/authority/__tests__/kit.ts
const targets = new TestStewardedTargets();
const t: TestContext = createTestContainer({
  overrides: () => ({ stewardedTargetDirectory: targets }),
});
```

Domains wrap it in a small kit of fixtures built through usecases (`authorityKit` in `application/authority/__tests__/kit.ts`, `createLoginTestContext` in `application/account/__tests__/loginFixtures.ts`).

### Naming (design.md D-11)

`spec/testcases/{d}/{usecase}.md` → `application/{d}/__tests__/{usecase}.test.ts`; `spec/testcases/ports/{port}.md` → `adapters/do/__conformance__/{port}.ts`. Each `##` section is a `describe`, each table row an `it` titled `{usecase}#{n} {前提条件} / {操作}`, `n` counting rows through the file:

```ts
it("grantRole#1 O はサービス運営者。U のアカウントがある。編集担当者はいない / O を Actor として、editor と U のメールアドレスで実行する", async () => {
  const k = authorityKit();
  // …
});
```

## 7. Error design

| Layer | Class | `kind` | Where |
| --- | --- | --- | --- |
| Domain | `BusinessRuleError<{D}ErrorCode>` | `business` | `domain/error.ts` |
| Domain (storage) | `RehydrationError` → adapters rethrow as `SystemError(DATA_INTEGRITY_ERROR)` | — | `domain/error.ts` |
| Application | `NotFoundError`, `ConflictError`, `UnauthorizedError`, `ForbiddenError`, `SystemError` | `notFound`, `conflict`, `unauthorized`, `forbidden`, `system` | `application/errors.ts` |
| Presentation | `AppServerError` carrying the `SerializedError` union | + `validation`, `unknown` | `apps/web/app/presentation/errorResponse.ts` |

Every class extends `CodedError` (`lib/error.ts`) and serializes itself with `toSerialized()`; `serializeError` never enumerates classes, and `httpStatusFor` maps the `kind` to a status. How a business code is shown (CS-08 / CS-10) is decided per code in the catalog — `presentBusinessError(code)` in `apps/web/app/presentation/businessErrorCatalog.ts`. The catch policy per layer boundary is in `AGENTS.md` (Error handling).
