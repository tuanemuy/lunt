import type { EmailAddress } from "@repo/core/domain/common/emailAddress";
import type { RenderedMail } from "@repo/core/domain/notification/mail";
import type { Mailer } from "@repo/core/domain/notification/ports/mailer";
import { describe, expect, it } from "vitest";

/** A delivered mail as the person reading the inbox sees it. */
export type ObservedMail = Readonly<{
  to: string;
  subject: string;
  text: string;
}>;

export type MailerHarness = Readonly<{
  mailer: Mailer;
  /**
   * Two distinct recipients (real mailboxes when mail really leaves); the
   * first is treated as an address without an account — the port never
   * reads accounts.
   */
  recipients: readonly [EmailAddress, EmailAddress];
  /**
   * Mails delivered to `to` so far. Absent when the backend cannot be read
   * back automatically (SMTP: check the provider's inbox by hand); the
   * cases then only check that sending is accepted.
   */
  observe?:
    | ((to: EmailAddress) => Promise<readonly ObservedMail[]>)
    | undefined;
}>;

let counter = 0;

function mailTo(
  to: EmailAddress,
  link: RenderedMail["link"] = null,
): RenderedMail {
  counter += 1;
  const marker = `${Date.now().toString(36)}-${counter}`;
  return {
    to,
    subject: `Lunt mailer conformance ${marker}`,
    body: [
      `Mailer conformance ${marker}`,
      ...(link === null ? [] : [`https://lunt.example/open/${marker}`]),
    ].join("\n"),
    link,
  };
}

const LINK: RenderedMail["link"] = {
  kind: "grantedAuthority",
  granted: { kind: "role", role: "editor" },
};

/**
 * `spec/testcases/ports/mailer.md`, over any backend: the test transport,
 * the development inbox, or SMTP.
 */
export function describeMailerContract(
  name: string,
  makeHarness: () => Promise<MailerHarness>,
): void {
  const received = async (
    h: MailerHarness,
    to: EmailAddress,
    mail: RenderedMail,
  ): Promise<readonly ObservedMail[] | null> => {
    if (h.observe === undefined) return null;
    return (await h.observe(to)).filter(
      (observed) => observed.subject === mail.subject,
    );
  };

  const expectDelivered = async (
    h: MailerHarness,
    mail: RenderedMail,
    times = 1,
  ): Promise<void> => {
    const mails = await received(h, mail.to, mail);
    if (mails === null) return;
    expect(mails).toHaveLength(times);
    for (const observed of mails) {
      expect(observed.to).toBe(mail.to);
      expect(observed.text).toBe(mail.body);
    }
  };

  describe(`Mailer contract (${name})`, () => {
    it("mailer#1 宛先 M1、件名、本文を持つ RenderedMail / send を呼ぶ", async () => {
      const h = await makeHarness();
      const mail = mailTo(h.recipients[0]);
      await expect(h.mailer.send(mail)).resolves.toBeUndefined();
      await expectDelivered(h, mail);
    });

    it("mailer#2 行き先（link）を持つ RenderedMail（本文は行き先の URL を含む）と、link が null の RenderedMail / それぞれ send を呼ぶ", async () => {
      const h = await makeHarness();
      const linked = mailTo(h.recipients[0], LINK);
      const plain = mailTo(h.recipients[0]);
      await h.mailer.send(linked);
      await h.mailer.send(plain);
      await expectDelivered(h, linked);
      await expectDelivered(h, plain);
    });

    it("mailer#3 アカウントのないメールアドレスを to とする RenderedMail / send を呼ぶ", async () => {
      const h = await makeHarness();
      const mail = mailTo(h.recipients[1]);
      await expect(h.mailer.send(mail)).resolves.toBeUndefined();
      await expectDelivered(h, mail);
    });

    it("mailer#4 宛先 M1 への send が成立している / 宛先 M2 の RenderedMail で send を呼ぶ", async () => {
      const h = await makeHarness();
      const first = mailTo(h.recipients[0]);
      const second = mailTo(h.recipients[1]);
      await h.mailer.send(first);
      await h.mailer.send(second);
      await expectDelivered(h, first);
      await expectDelivered(h, second);
    });

    it("mailer#5 宛先 M1 への send が成立している / 同じ内容の RenderedMail で、もう一度 send を呼ぶ", async () => {
      const h = await makeHarness();
      const mail = mailTo(h.recipients[0]);
      await h.mailer.send(mail);
      await expect(h.mailer.send(mail)).resolves.toBeUndefined();
      await expectDelivered(h, mail, 2);
    });
  });
}
