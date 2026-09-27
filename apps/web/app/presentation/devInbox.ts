import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { errorResponseMiddleware } from "./errorResponseMiddleware";
import { validateInput } from "./validator";

export type DevInboxMail = Readonly<{
  id: string;
  from: string;
  to: string;
  subject: string;
  text: string;
  /** ISO 8601. */
  sentAt: string;
}>;

export type DevInboxView =
  | Readonly<{ kind: "inbox"; mails: readonly DevInboxMail[] }>
  | Readonly<{ kind: "disabled" }>;

export const devInboxSearchSchema = z.object({
  to: z.string().trim().max(254).optional().catch(undefined),
});

/**
 * Development tool: the mails the development transport holds, newest
 * first, optionally for one recipient (`/__dev/inbox`).
 */
export const listDevInboxFn = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .validator(
    validateInput(z.object({ to: z.string().trim().max(254).optional() })),
  )
  .handler(async ({ data }): Promise<DevInboxView> => {
    const [{ getContainer }, { listDevInbox }] = await Promise.all([
      import("@repo/core/application/di/containerStore"),
      import("@repo/core/application/dev/devInbox"),
    ]);
    const container = await getContainer();
    const result = await listDevInbox({
      container,
      input: { to: data.to === "" ? undefined : data.to, limit: 50 },
    });
    if (result.kind === "disabled") return result;
    return {
      kind: "inbox",
      mails: result.mails.map((mail) => ({
        id: mail.id,
        from: mail.from,
        to: mail.to,
        subject: mail.subject,
        text: mail.text,
        sentAt: mail.sentAt.toISOString(),
      })),
    };
  });
