import type { ExternalIdentityVerifier } from "@repo/core/domain/account/ports/externalIdentityVerifier";
import type { LoginMailSender } from "@repo/core/domain/account/ports/loginMailSender";
import type { LoginSecretGenerator } from "@repo/core/domain/account/ports/loginSecretGenerator";
import type { DevInbox } from "../dev/devInbox";
import type { FakeIdp } from "../dev/fakeIdp";
import type { ExternalLoginStarter } from "./externalLogin";

/** Login settings (brief A-06): environment-driven, with development defaults. */
export type LoginSettings = Readonly<{
  /** How long a login mail's link and code stay usable (`validForMs`). */
  challengeValidForMs: number;
  /** Wrong codes that close a login challenge (`maxCodeAttempts`, I-18). */
  maxCodeAttempts: number;
  /**
   * Unexpired challenges (any status) an address may have before a new
   * login mail is refused (`maxUnexpiredChallenges`).
   */
  maxUnexpiredChallenges: number;
}>;

/**
 * Account's ports and settings that live on the container: read-only ports
 * that do not join a unit of work, external IO ports, and settings.
 */
export type AccountServices = Readonly<{
  loginSettings: LoginSettings;
  loginSecretGenerator: LoginSecretGenerator;
  loginMailSender: LoginMailSender;
  externalIdentityVerifier: ExternalIdentityVerifier;
  /** Starts the redirect to a provider; see `externalLogin.ts`. */
  externalLoginStarter: ExternalLoginStarter;
  /** The development inbox, when mail goes there (`MAIL_TRANSPORT=devInbox`). */
  devInbox: DevInbox | null;
  /** The development fake provider's screen (`EXTERNAL_IDP=fake`). */
  fakeIdp: FakeIdp | null;
}>;
