import { ForbiddenError } from "../errors";
import type { ServiceArgs } from "../types";

/** A mail the development inbox holds. */
export type DevMail = Readonly<{
  id: string;
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string | null;
  sentAt: Date;
}>;

/**
 * Reads the development inbox (design.md D-07). On the container as
 * `devInbox` when `MAIL_TRANSPORT=devInbox`, `null` otherwise.
 */
export interface DevInbox {
  /** Newest first; `to` filters by recipient (case-insensitive). */
  list(
    query: Readonly<{ to?: string | undefined; limit: number }>,
  ): Promise<readonly DevMail[]>;
}

export type ListDevInboxInput = Readonly<{
  /** Recipient filter; blank or absent lists every mail. */
  to?: string | undefined;
  /** 1–200, default 50. */
  limit?: number | undefined;
}>;

export type ListDevInboxOutput =
  | Readonly<{ kind: "inbox"; mails: readonly DevMail[] }>
  /** Mail goes out over SMTP; there is no development inbox to show. */
  | Readonly<{ kind: "disabled" }>;

const MAX_LIMIT = 200;
const DEFAULT_LIMIT = 50;

/**
 * Development tool: the mails the development transport stored, newest
 * first — for `/__dev/inbox`. Refused (`ForbiddenError`
 * `DEV_TOOLS_DISABLED`) unless the development tools are on.
 */
export async function listDevInbox({
  container,
  input,
}: ServiceArgs<ListDevInboxInput>): Promise<ListDevInboxOutput> {
  if (!container.runtime.devTools) {
    throw new ForbiddenError(
      "DEV_TOOLS_DISABLED",
      "Development tools are disabled",
    );
  }
  if (container.devInbox === null) return { kind: "disabled" };
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Math.trunc(input.limit ?? DEFAULT_LIMIT)),
  );
  return {
    kind: "inbox",
    mails: await container.devInbox.list({ to: input.to, limit }),
  };
}
