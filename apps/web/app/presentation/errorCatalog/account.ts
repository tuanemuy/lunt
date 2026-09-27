import {
  AccountErrorCode,
  type AccountErrorCode as AccountErrorCodeValue,
} from "@repo/core/domain/account/errorCode";
import {
  type BusinessErrorPresentation,
  changed,
  invalid,
} from "./presentation";

/** How each Account business error is shown (CS-08 / CS-10). */
export const accountErrorCatalog = {
  [AccountErrorCode.LoginChallengeInvalid]: changed(
    "このリンクまたはコードは使えません。有効期間を過ぎたか、すでに使われています。メールアドレスの入力からやり直してください",
  ),
  [AccountErrorCode.LoginCodeMismatch]: invalid(
    "コードが正しくありません。メールに届いたコードを入力し直してください",
  ),
  [AccountErrorCode.LoginRequestsExceeded]: changed(
    "このメールアドレスへのログイン用メールが上限に達したため、送りませんでした。届いているメールのリンクかコードを使うか、しばらく時間をおいてから送り直してください",
  ),
  [AccountErrorCode.InvalidLoginSecret]: invalid(
    "メールに届いたコードを入力してください",
  ),
  [AccountErrorCode.InvalidExternalProviderKey]: invalid(
    "ログインの方法が正しくありません",
  ),
  [AccountErrorCode.UnknownExternalProvider]: invalid(
    "このログインの方法は使えません",
  ),
  [AccountErrorCode.VerifiedEmailRequired]: invalid(
    "確認済みのメールアドレスを受け取れなかったため、ログインできませんでした。メールアドレスでログインするか、別の外部アカウントを選んでください",
  ),
  [AccountErrorCode.ExternalLoginNotAuthenticated]: changed(
    "外部アカウントでのログインが完了しませんでした。もう一度お試しください",
  ),
} satisfies Record<AccountErrorCodeValue, BusinessErrorPresentation>;
