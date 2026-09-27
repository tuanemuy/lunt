import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { errorResponseMiddleware } from "./errorResponseMiddleware";
import { safeNextPath } from "./nextPath";
import { parseGeneratedId, validateInput } from "./validator";

/**
 * Why an external login came back to MY-02 without logging in:
 * `no_email` — the provider gave no verified address (メールアドレスを
 * 受け取れない); `failed` — cancelled, refused or a provider outage
 * (外部アカウントの認証の不成立).
 */
export const EXTERNAL_LOGIN_FAILURES = ["no_email", "failed"] as const;
export type ExternalLoginFailure = (typeof EXTERNAL_LOGIN_FAILURES)[number];

/** MY-02's URL: where to return after login, and an external login's failure. */
export const loginSearchSchema = z.object({
  next: z.string().max(2048).optional().catch(undefined),
  external: z.enum(EXTERNAL_LOGIN_FAILURES).optional().catch(undefined),
});

/** How the login screen names each external provider. */
export const EXTERNAL_PROVIDER_LABELS: Readonly<Record<string, string>> = {
  google: "Google",
};

export type LoginPageData = Readonly<{
  devTools: boolean;
  /** The address of the account this browser is logged in as, if any. */
  currentEmail: string | null;
  /** Provider keys, in the order the screen offers them. */
  providers: readonly string[];
}>;

/** What MY-02 shows before anything is entered. */
export const loadLoginPageFn = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .handler(async (): Promise<LoginPageData> => {
    const [{ getContainer }, { resolveActor }, { getMyAccount }] =
      await Promise.all([
        import("@repo/core/application/di/containerStore"),
        import("./actor"),
        import("@repo/core/application/account/getMyAccount"),
      ]);
    const container = await getContainer();
    const actor = await resolveActor(container);
    const currentEmail =
      actor === null
        ? null
        : (await getMyAccount({ container, actor })).email.toString();
    return {
      devTools: container.runtime.devTools,
      currentEmail,
      providers: container.externalLoginStarter.providers.map(String),
    };
  });

const emailField = z
  .string()
  .trim()
  .min(1, "メールアドレスを入力してください")
  .max(254, "メールアドレスが長すぎます");

const challengeIdField = z.string().min(1).max(64);

export const startEmailLoginSchema = z.object({
  challengeId: challengeIdField,
  email: emailField,
});

/**
 * Sends the login mail (link and code) to `email`. `challengeId` is minted
 * by the browser once per send and resent unchanged on a retry, so a lost
 * response never sends a second mail.
 */
export const startEmailLoginFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .validator(validateInput(startEmailLoginSchema))
  .handler(async ({ data }) => {
    const [{ getContainer }, { startEmailLogin }] = await Promise.all([
      import("@repo/core/application/di/containerStore"),
      import("@repo/core/application/account/startEmailLogin"),
    ]);
    const container = await getContainer();
    const challengeId = parseGeneratedId(
      container.idGenerator,
      "challengeId",
      data.challengeId,
    );
    await startEmailLogin({
      container,
      input: { challengeId, email: data.email },
    });
    return null;
  });

export const completeLoginByCodeSchema = z.object({
  challengeId: challengeIdField,
  code: z
    .string()
    .trim()
    .min(1, "メールに届いたコードを入力してください")
    .max(32, "コードが正しくありません"),
  next: z.string().max(2048).optional(),
});

/** Logs this browser in by the mail's code; answers where to go next. */
export const completeLoginByCodeFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .validator(validateInput(completeLoginByCodeSchema))
  .handler(async ({ data }) => {
    const [{ getContainer }, { completeLoginByCode }, { startSession }] =
      await Promise.all([
        import("@repo/core/application/di/containerStore"),
        import("@repo/core/application/account/completeLoginByCode"),
        import("./actor"),
      ]);
    const container = await getContainer();
    const { accountId } = await completeLoginByCode({
      container,
      input: { challengeId: data.challengeId, code: data.code },
    });
    await startSession(container, accountId);
    return { next: safeNextPath(data.next) };
  });

export const completeLoginByLinkSchema = z.object({
  token: z.string().min(1).max(512),
  next: z.string().max(2048).optional(),
});

/**
 * Logs this browser in by the mail's link token. The link's page posts it
 * after hydration instead of redeeming it on the GET, so a mail scanner
 * that fetches the link without running script cannot use it up.
 */
export const completeLoginByLinkFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .validator(validateInput(completeLoginByLinkSchema))
  .handler(async ({ data }) => {
    const [{ getContainer }, { completeLoginByLink }, { startSession }] =
      await Promise.all([
        import("@repo/core/application/di/containerStore"),
        import("@repo/core/application/account/completeLoginByLink"),
        import("./actor"),
      ]);
    const container = await getContainer();
    const { accountId } = await completeLoginByLink({
      container,
      input: { linkToken: data.token },
    });
    await startSession(container, accountId);
    return { next: safeNextPath(data.next) };
  });
