import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { errorResponseMiddleware } from "./errorResponseMiddleware";
import { validateInput } from "./validator";

/** What the fake provider's screen shows about the request it received. */
export type FakeIdpRequestView =
  | Readonly<{ kind: "valid"; returnsTo: string }>
  | Readonly<{ kind: "invalid" }>;

const querySchema = z.object({ query: z.string().max(8192) });

async function parseRequest(query: string) {
  const [{ getContainer }, { fakeIdpAuthorizeRequestSchema }] =
    await Promise.all([
      import("@repo/core/application/di/containerStore"),
      import("@repo/core/adapters/identity/fakeIdp"),
    ]);
  const container = await getContainer();
  if (!container.runtime.devTools) {
    const { ForbiddenError } = await import("@repo/core/application/errors");
    throw new ForbiddenError(
      "DEV_TOOLS_DISABLED",
      "Development tools are disabled",
    );
  }
  const parsed = fakeIdpAuthorizeRequestSchema.safeParse(
    Object.fromEntries(new URLSearchParams(query)),
  );
  // Only this app's own callback: the fake provider is no open redirector.
  const sameOrigin =
    parsed.success &&
    new URL(parsed.data.redirect_uri).origin ===
      new URL(container.config.appUrl).origin;
  return {
    container,
    request: parsed.success && sameOrigin ? parsed.data : null,
  };
}

/**
 * Development tool: checks the authorization request the fake provider's
 * screen (`/__dev/idp/authorize`) was opened with.
 */
export const checkFakeIdpRequestFn = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .validator(validateInput(querySchema))
  .handler(async ({ data }): Promise<FakeIdpRequestView> => {
    const { request } = await parseRequest(data.query);
    return request === null
      ? { kind: "invalid" }
      : { kind: "valid", returnsTo: new URL(request.redirect_uri).pathname };
  });

export const fakeIdpChoiceSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("verified"),
    email: z
      .string()
      .trim()
      .min(1, "メールアドレスを入力してください")
      .max(254),
  }),
  z.object({
    kind: z.literal("unverified"),
    email: z
      .string()
      .trim()
      .min(1, "メールアドレスを入力してください")
      .max(254),
  }),
  z.object({ kind: z.literal("no_email") }),
  z.object({ kind: z.literal("cancel") }),
]);

export type FakeIdpChoiceInput = z.infer<typeof fakeIdpChoiceSchema>;

/**
 * Development tool: the fake provider's answer to the request — where to
 * send the browser back to, with a signed code or `error=access_denied`.
 */
export const answerFakeIdpFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .validator(validateInput(querySchema.extend({ choice: fakeIdpChoiceSchema })))
  .handler(async ({ data }) => {
    const { container, request } = await parseRequest(data.query);
    if (request === null) {
      const { NotFoundError } = await import("@repo/core/application/errors");
      throw new NotFoundError(
        "FAKE_IDP_REQUEST_INVALID",
        "The authorization request is invalid",
      );
    }
    const { fakeIdpCallbackUrl } = await import(
      "@repo/core/adapters/identity/fakeIdp"
    );
    const location = await fakeIdpCallbackUrl({
      secret: container.runtime.sessionSecret,
      now: container.clock.now(),
      request,
      choice: data.choice,
    });
    return { location };
  });
