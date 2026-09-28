import { type EventDraft, EventId } from "@repo/core/domain/common/event";
import type { ApplicationId, ListingId } from "@repo/core/domain/common/ids";
import type { Version } from "@repo/core/domain/common/version";
import type { Listing } from "@repo/core/domain/listing/listing";
import type { RequestContainer } from "../../di/types";
import type { LuntDomainEvent } from "../../events/registry";
import type { ActorServiceArgs } from "../../types";
import type { ApproveApplicationInput } from "../approval";
import { getApplicationForReview } from "../getApplicationForReview";
import { getMyApplication } from "../getMyApplication";
import {
  listApplicationsAwaitingReview,
  type ReviewSection,
} from "../listApplicationsAwaitingReview";
import { rejectApplication } from "../rejectApplication";
import {
  type ResubmissionContent,
  resubmitApplication,
} from "../resubmitApplication";
import { sendBackApplication } from "../sendBackApplication";
import { withdrawApplication } from "../withdrawApplication";
import { applicationKit, type Person } from "./kit";

export type ReviewKit = Awaited<ReturnType<typeof reviewKit>>;

type Options = Readonly<{ version?: Version; container?: RequestContainer }>;

/**
 * Application's kit for the reviewer's usecases and the readers: an
 * operator `O` (the approver of the stage-2 kinds) and the decisions,
 * resubmission, withdrawal and readers as one-line calls. A decision is
 * sent with the version stored now unless `version` says otherwise.
 */
export async function reviewKit() {
  const k = await applicationKit();
  const O = await k.operator("O");

  const versionOf = async (id: ApplicationId): Promise<Version> =>
    (await k.app(id)).version;

  const args = async <T extends object>(
    who: Person,
    id: ApplicationId,
    extra: T,
    options: Options,
  ) => ({
    container: options.container ?? k.container,
    actor: who.actor,
    input: {
      applicationId: id,
      version: options.version ?? (await versionOf(id)),
      ...extra,
    },
  });

  const sendBackAs = async (
    who: Person,
    id: ApplicationId,
    request = "店舗との関係を確認できる資料を添えてください",
    options: Options = {},
  ) => sendBackApplication(await args(who, id, { request }, options));

  const rejectAs = async (
    who: Person,
    id: ApplicationId,
    reason = "既存の店舗と重複しています",
    options: Options = {},
  ) => rejectApplication(await args(who, id, { reason }, options));

  const approveAs = async <R>(
    usecase: (a: ActorServiceArgs<ApproveApplicationInput>) => Promise<R>,
    who: Person,
    id: ApplicationId,
    options: Options = {},
  ): Promise<R> => usecase(await args(who, id, {}, options));

  /** A returned application resubmitted by `who` with `amended`. */
  const resubmitAs = async (
    who: Person,
    id: ApplicationId,
    amended: ResubmissionContent,
    reply: string | null = null,
  ) => resubmitApplication(await args(who, id, { amended, reply }, {}));

  /** A stewardship claim resubmitted by `who` with `relationship`. */
  const resubmitClaim = async (
    who: Person,
    id: ApplicationId,
    relationship = "店主です（登記簿を添えます）",
    reply: string | null = "登記簿の写しを添えました",
  ) =>
    resubmitApplication(
      await args(
        who,
        id,
        {
          amended: {
            kind: "stewardship",
            relationship,
            evidence: "03-0000-0000",
          },
          reply,
        },
        {},
      ),
    );

  const withdrawAs = async (who: Person, id: ApplicationId) =>
    withdrawApplication(await args(who, id, {}, {}));

  const awaiting = (
    section: ReviewSection,
    who: Person = O,
    pagination = { page: 1, limit: 100 },
  ) =>
    listApplicationsAwaitingReview({
      container: k.container,
      actor: who.actor,
      input: { section, pagination },
    });

  const forReview = (who: Person, applicationId: ApplicationId) =>
    getApplicationForReview({
      container: k.container,
      actor: who.actor,
      input: { applicationId },
    });

  const mine = (who: Person, applicationId: ApplicationId) =>
    getMyApplication({
      container: k.container,
      actor: who.actor,
      input: { applicationId },
    });

  /** The stored listing (the application kit's `stored` reads applications). */
  async function listingOf(id: ListingId): Promise<Listing> {
    const found = await k.findListing(id);
    if (found === null) throw new Error(`no listing ${id}`);
    return found;
  }

  /** A draft as the relay delivers it: with an event id. */
  const delivered = <E extends LuntDomainEvent>(draft: EventDraft<E>): E =>
    ({ ...draft, id: EventId.create(k.newId()) }) as unknown as E;

  /** A place (no steward, no photos) and `who`'s stewardship claim on it. */
  async function claimOnPlace(who: Person, name = "店舗") {
    const placeId = await k.place(name);
    return { placeId, claim: await k.claim(who, { placeId }) };
  }

  return {
    ...k,
    O,
    versionOf,
    sendBackAs,
    rejectAs,
    approveAs,
    resubmitAs,
    resubmitClaim,
    withdrawAs,
    awaiting,
    forReview,
    mine,
    listingOf,
    delivered,
    claimOnPlace,
  };
}
