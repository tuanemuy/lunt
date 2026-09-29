import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { errorResponseMiddleware } from "./errorResponseMiddleware";
import { SUSPENDABLE_KINDS } from "./opsSubject";
import { validateInput } from "./validator";

export const changeSuspensionSchema = z.object({
  kind: z.enum(SUSPENDABLE_KINDS),
  id: z.string().min(1).max(64),
  suspend: z.boolean(),
});

/**
 * OM-03: suspends a region or an event (運営による非公開), or lifts it
 * (MOD-07). Stores and listings keep their own server functions.
 */
export const changeSuspensionFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .validator(validateInput(changeSuspensionSchema))
  .handler(async ({ data }) => {
    const { changeSuspension } = await import("./opsData");
    await changeSuspension(data.kind, data.id, data.suspend);
    return null;
  });
