import type { DevInbox, DevMail } from "@repo/core/application/dev/devInbox";
import type { Clock } from "@repo/core/application/ports/clock";
import type { IdGenerator } from "@repo/core/application/ports/idGenerator";
import type { MailTransport, OutgoingMail } from "../shared/mailTransport";
import { mapDoError } from "./helpers";
import type { LuntStateClient } from "./protocol/client";

/**
 * Development transport (design.md D-07): "sends" by storing the mail in
 * the state object's `dev_mailbox`, where `/__dev/inbox` shows it. No mail
 * leaves the machine. Refused by DI unless the development tools are on.
 */
export class DevInboxMailTransport implements MailTransport {
  constructor(
    private readonly client: Pick<LuntStateClient, "devMailboxAppend">,
    private readonly deps: Readonly<{
      clock: Clock;
      idGenerator: IdGenerator;
      from: string;
    }>,
  ) {}

  send(mail: OutgoingMail): Promise<void> {
    return mapDoError("Failed to store mail in the development inbox", () =>
      this.client.devMailboxAppend({
        id: this.deps.idGenerator.next(),
        from: this.deps.from,
        to: mail.to,
        subject: mail.subject,
        text: mail.text,
        html: mail.html ?? null,
        sentAt: this.deps.clock.now(),
      }),
    );
  }
}

/** Reads the development inbox the transport above writes. */
export class DoDevInbox implements DevInbox {
  constructor(
    private readonly client: Pick<LuntStateClient, "devMailboxList">,
  ) {}

  list(
    query: Readonly<{ to?: string | undefined; limit: number }>,
  ): Promise<readonly DevMail[]> {
    const to = query.to?.trim().toLowerCase();
    return mapDoError("Failed to read the development inbox", () =>
      this.client.devMailboxList({
        ...(to === undefined || to.length === 0 ? {} : { to }),
        limit: query.limit,
      }),
    );
  }
}
