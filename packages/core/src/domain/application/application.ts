import type {
  ApplicationCaseIn,
  ApplicationIn,
  ApplicationOf as ApplicationOfIn,
  KindName,
  RequestIn,
  SlotIn,
  TargetIn,
} from "./kind";
import { APPLICATION_KINDS, type ApplicationKindMap } from "./kinds";
import { createApplicationModel } from "./model";
import type { Active, Closed, Returned, UnderReview } from "./status";

/**
 * The Application domain bound to the production kinds
 * (`domain/application/kinds.ts`). Usecases import the domain objects and
 * types from here; tests of the kind-agnostic core bind the same model to
 * test-only kinds instead.
 */
export const applicationModel = createApplicationModel(APPLICATION_KINDS);

export const {
  Application,
  ApplicationCase,
  ApplicationSlot,
  Premise,
  SubmissionScope,
  ApproverPolicy,
  OverdueReviewWatch,
} = applicationModel;

export type ApplicationKind = KindName<ApplicationKindMap>;
export type ApplicationTarget = TargetIn<ApplicationKindMap>;
export type TargetOf<K extends ApplicationKind> =
  ApplicationKindMap[K]["target"];
export type Application = ApplicationIn<ApplicationKindMap>;
export type ApplicationOf<K extends ApplicationKind> = ApplicationOfIn<
  ApplicationKindMap,
  K
>;
export type ApplicationCase = ApplicationCaseIn<ApplicationKindMap>;
export type ApplicationSlot = SlotIn<ApplicationKindMap>;
export type SubmissionRequest = RequestIn<ApplicationKindMap>;
export type UnderReviewApplication = UnderReview<Application>;
export type ReturnedApplication = Returned<Application>;
export type ActiveApplication = Active<Application>;
export type ClosedApplication = Closed<Application>;
