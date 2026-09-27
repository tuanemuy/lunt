import type { Applicant } from "@repo/core/domain/application/applicant";
import type { ApproverSeat } from "@repo/core/domain/application/approverSeat";
import type { ApplicationEvent } from "@repo/core/domain/application/events";
import type { EventDecoder } from "@repo/core/domain/common/event";
import {
  AccountId,
  ApplicationId,
  OccasionId,
  PlaceId,
  RegionId,
} from "@repo/core/domain/common/ids";
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
        "Stored application event holds an invalid value",
        error,
      );
    }
  };

const applicantSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("individual"), accountId: z.string() }).strict(),
  z.object({ kind: z.literal("place"), placeId: z.string() }).strict(),
]);

const approverSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("operator") }).strict(),
  z
    .object({
      kind: z.literal("steward"),
      target: z.discriminatedUnion("kind", [
        z.object({ kind: z.literal("region"), id: z.string() }).strict(),
        z.object({ kind: z.literal("occasion"), id: z.string() }).strict(),
      ]),
    })
    .strict(),
]);

const toApplicantSchema = z
  .object({ applicationId: z.string(), applicant: applicantSchema })
  .strict();

const toApproverSchema = z
  .object({ applicationId: z.string(), approver: approverSchema })
  .strict();

const toApplicant = (raw: z.infer<typeof applicantSchema>): Applicant =>
  raw.kind === "individual"
    ? { kind: "individual", accountId: AccountId.create(raw.accountId) }
    : { kind: "place", placeId: PlaceId.create(raw.placeId) };

const toApprover = (raw: z.infer<typeof approverSchema>): ApproverSeat => {
  if (raw.kind === "operator") return { kind: "operator" };
  return {
    kind: "steward",
    target:
      raw.target.kind === "region"
        ? { kind: "region", id: RegionId.create(raw.target.id) }
        : { kind: "occasion", id: OccasionId.create(raw.target.id) },
  };
};

const addressedToApplicant = intact((p: z.infer<typeof toApplicantSchema>) => ({
  applicationId: ApplicationId.create(p.applicationId),
  applicant: toApplicant(p.applicant),
}));

const addressedToApprover = intact((p: z.infer<typeof toApproverSchema>) => ({
  applicationId: ApplicationId.create(p.applicationId),
  approver: toApprover(p.approver),
}));

/** An instant as stored: the JSON form of a `Date`. */
function storedInstant(raw: string): Date {
  const date = new Date(raw);
  if (Number.isNaN(date.getTime()) || date.toISOString() !== raw) {
    throw new Error(`Invalid stored instant: ${raw}`);
  }
  return date;
}

type ApplicationEventDecoders = {
  readonly [K in ApplicationEvent["type"]]: EventDecoder<
    Extract<ApplicationEvent, { type: K }>
  >;
};

/** Decoders of Application's events as stored in the outbox. */
export const applicationEventDecoders: ApplicationEventDecoders = {
  "application.submitted": buildEventDecoder(
    "application.submitted",
    toApproverSchema,
    addressedToApprover,
  ),
  "application.resubmitted": buildEventDecoder(
    "application.resubmitted",
    toApproverSchema,
    addressedToApprover,
  ),
  "application.withdrawn": buildEventDecoder(
    "application.withdrawn",
    toApproverSchema,
    addressedToApprover,
  ),
  "application.returned": buildEventDecoder(
    "application.returned",
    toApplicantSchema,
    addressedToApplicant,
  ),
  "application.approved": buildEventDecoder(
    "application.approved",
    toApplicantSchema,
    addressedToApplicant,
  ),
  "application.rejected": buildEventDecoder(
    "application.rejected",
    toApplicantSchema,
    addressedToApplicant,
  ),
  "application.lapsed": buildEventDecoder(
    "application.lapsed",
    toApplicantSchema,
    addressedToApplicant,
  ),
  "application.review_period_elapsed": buildEventDecoder(
    "application.review_period_elapsed",
    z.object({ applicationId: z.string(), pendingSince: z.string() }).strict(),
    intact((p) => ({
      applicationId: ApplicationId.create(p.applicationId),
      pendingSince: storedInstant(p.pendingSince),
    })),
  ),
};
