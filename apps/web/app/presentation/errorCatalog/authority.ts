import type { AuthorityErrorCode } from "@repo/core/domain/authority/errorCode";
import {
  type BusinessErrorPresentation,
  changed,
  invalid,
} from "./presentation";

/** How each Authority business error is shown (CS-08 / CS-10). */
export const authorityErrorCatalog = {
  AUTHORITY_ALREADY_STEWARD: changed(
    "このアカウントは、すでにこの対象の管理者です",
  ),
  AUTHORITY_INVITATION_ALREADY_PENDING: invalid(
    "このメールアドレスには、承諾前の招待がすでにあります",
  ),
  AUTHORITY_INVITATION_NOT_FOUND: changed(
    "この招待は、すでに承諾されたか取り消されています",
  ),
  AUTHORITY_INVITATION_EMAIL_MISMATCH: changed(
    "この招待は、別のメールアドレス宛てです",
  ),
  AUTHORITY_NOT_A_STEWARD: changed(
    "このアカウントは、すでにこの対象の管理者ではありません",
  ),
  AUTHORITY_OPERATORS_ALREADY_ESTABLISHED: changed(
    "サービス運営者は、すでに設定されています",
  ),
  AUTHORITY_OPERATORS_NOT_ESTABLISHED: changed(
    "サービス運営者がまだ設定されていません",
  ),
  AUTHORITY_ROLE_ALREADY_HELD: invalid(
    "このアカウントは、すでにこの役割を持っています",
  ),
  AUTHORITY_ROLE_NOT_HELD: changed(
    "このアカウントは、すでにこの役割を持っていません",
  ),
  AUTHORITY_LAST_OPERATOR: invalid(
    "サービス運営者が1人だけのため、この役割は解除できません",
  ),
} satisfies Record<AuthorityErrorCode, BusinessErrorPresentation>;
