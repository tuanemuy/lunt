import { LinkToken, LoginCode } from "@repo/core/domain/account/loginSecret";
import type { LoginMailSender } from "@repo/core/domain/account/ports/loginMailSender";
import type { EmailAddress } from "@repo/core/domain/common/emailAddress";
import { describe, expect, it } from "vitest";
import { LOGIN_LINK_PATH, readLoginMail } from "../mailLoginMailSender";

/** A delivered mail as the person reading the inbox sees it. */
export type ObservedMail = Readonly<{ to: string; text: string }>;

export type LoginMailSenderHarness = Readonly<{
  sender: LoginMailSender;
  /** The Lunt origin the links must point at. */
  appUrl: string;
  /** Two distinct recipients (real mailboxes when mail really leaves). */
  recipients: readonly [EmailAddress, EmailAddress];
  /**
   * Mails delivered to `to` so far. Absent when the backend cannot be read
   * back automatically (SMTP: check the provider's inbox by hand); the
   * cases that inspect the mail are then skipped.
   */
  observe?:
    | ((to: EmailAddress) => Promise<readonly ObservedMail[]>)
    | undefined;
}>;

let counter = 0;

function secrets(): Readonly<{ linkToken: LinkToken; code: LoginCode }> {
  counter += 1;
  const salt = `${Date.now().toString(36)}${counter}`;
  return {
    linkToken: LinkToken.create(`conformance-link-${salt}`),
    code: LoginCode.create(String(100000 + ((counter * 7919) % 900000))),
  };
}

/**
 * `spec/testcases/ports/loginMailSender.md`, over any backend: the test
 * transport, the development inbox, or SMTP.
 */
export function describeLoginMailSenderContract(
  name: string,
  makeHarness: () => Promise<LoginMailSenderHarness>,
  options: Readonly<{ observable: boolean }> = { observable: true },
): void {
  const observed = async (
    h: LoginMailSenderHarness,
    to: EmailAddress,
  ): Promise<readonly ObservedMail[]> => {
    if (h.observe === undefined) throw new Error(`${name} is not observable`);
    return h.observe(to);
  };

  describe(`LoginMailSender contract (${name})`, () => {
    it("loginMailSender#1 なし / send({ to, linkToken, code })", async () => {
      const h = await makeHarness();
      await expect(
        h.sender.send({ to: h.recipients[0], ...secrets() }),
      ).resolves.toBeUndefined();
    });

    it.skipIf(!options.observable)(
      "loginMailSender#2 なし / send の後、送ったメールを確かめる",
      async () => {
        const h = await makeHarness();
        const sent = secrets();
        await h.sender.send({ to: h.recipients[0], ...sent });
        const mails = await observed(h, h.recipients[0]);
        expect(mails).toHaveLength(1);
        const read = readLoginMail(mails[0]?.text ?? "", h.appUrl);
        expect(read.linkToken).toBe(sent.linkToken);
        expect(read.code).toBe(sent.code);
      },
    );

    it.skipIf(!options.observable)(
      "loginMailSender#3 なし / send の後、送ったメールのリンクを確かめる",
      async () => {
        const h = await makeHarness();
        const sent = secrets();
        await h.sender.send({ to: h.recipients[0], ...sent });
        const [mail] = await observed(h, h.recipients[0]);
        const { linkUrl } = readLoginMail(mail?.text ?? "", h.appUrl);
        expect(linkUrl).not.toBeNull();
        const url = new URL(linkUrl ?? "");
        expect(url.origin).toBe(new URL(h.appUrl).origin);
        expect(url.pathname).toBe(LOGIN_LINK_PATH);
        expect(url.searchParams.get("token")).toBe(sent.linkToken);
      },
    );

    it.skipIf(!options.observable)(
      "loginMailSender#4 なし / 違う to・違う秘密の値で send を2回呼ぶ",
      async () => {
        const h = await makeHarness();
        const [first, second] = h.recipients;
        const a = secrets();
        const b = secrets();
        await h.sender.send({ to: first, ...a });
        await h.sender.send({ to: second, ...b });
        for (const [to, own, other] of [
          [first, a, b],
          [second, b, a],
        ] as const) {
          const mails = await observed(h, to);
          expect(mails).toHaveLength(1);
          const text = mails[0]?.text ?? "";
          const read = readLoginMail(text, h.appUrl);
          expect(read.linkToken).toBe(own.linkToken);
          expect(read.code).toBe(own.code);
          expect(text).not.toContain(other.linkToken);
          expect(text).not.toContain(`コード: ${other.code}`);
        }
      },
    );
  });
}
