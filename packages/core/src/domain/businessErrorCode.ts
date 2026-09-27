import type { AccountErrorCode } from "@repo/core/domain/account/errorCode";
import type { ApplicationErrorCode } from "@repo/core/domain/application/errorCode";
import type { AreaErrorCode } from "@repo/core/domain/area/errorCode";
import type { AuthorityErrorCode } from "@repo/core/domain/authority/errorCode";
import type {
  CommonErrorCode,
  SubjectErrorCode,
} from "@repo/core/domain/common/errorCode";
import type { DiscoveryErrorCode } from "@repo/core/domain/discovery/errorCode";
import type { ListingErrorCode } from "@repo/core/domain/listing/errorCode";
import type { MediaErrorCode } from "@repo/core/domain/media/errorCode";
import type { NotificationErrorCode } from "@repo/core/domain/notification/errorCode";
import type { PlaceErrorCode } from "@repo/core/domain/place/errorCode";

/**
 * Every `BusinessRuleError` code a Lunt usecase can raise. Each domain
 * keeps its codes in `domain/{domain}/errorCode.ts` and they join here.
 * The presentation layer maps every member to the common state it shows
 * (`spec/pages/index.md` CS-08 / CS-10) in a table typed over this union,
 * so a new code does not compile until someone decides how the screen
 * presents it.
 */
export type BusinessErrorCode =
  | CommonErrorCode
  | SubjectErrorCode
  | AccountErrorCode
  | AuthorityErrorCode
  | ApplicationErrorCode
  | NotificationErrorCode
  | AreaErrorCode
  | MediaErrorCode
  | PlaceErrorCode
  | ListingErrorCode
  | DiscoveryErrorCode;
