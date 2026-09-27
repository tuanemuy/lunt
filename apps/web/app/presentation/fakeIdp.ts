import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { errorResponseMiddleware } from "./errorResponseMiddleware";
import { validateInput } from "./validator";

export type { FakeIdpRequestView } from "@repo/core/application/dev/fakeIdp";

const querySchema = z.object({ query: z.string().max(8192) });

async function loadFakeIdp() {
  const [{ getContainer }, usecases] = await Promise.all([
    import("@repo/core/application/di/containerStore"),
    import("@repo/core/application/dev/fakeIdp"),
  ]);
  return { container: await getContainer(), ...usecases };
}

/**
 * Development tool: checks the authorization request the fake provider's
 * screen (`/__dev/idp/authorize`) was opened with.
 */
export const checkFakeIdpRequestFn = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .validator(validateInput(querySchema))
  .handler(async ({ data }) => {
    const { container, checkFakeIdpRequest } = await loadFakeIdp();
    return checkFakeIdpRequest({ container, input: { query: data.query } });
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
    const { container, answerFakeIdp } = await loadFakeIdp();
    return answerFakeIdp({
      container,
      input: { query: data.query, choice: data.choice },
    });
  });
