import { LinkToken, LoginCode } from "@repo/core/domain/account/loginSecret";
import { EmailAddress } from "@repo/core/domain/common/emailAddress";
import { describe, expect, it } from "vitest";
import {
  loginLinkUrl,
  readLoginMail,
  renderLoginMail,
} from "../mailLoginMailSender";

describe("login mail", () => {
  const mail = renderLoginMail(
    {
      to: EmailAddress.create("a@example.com"),
      linkToken: LinkToken.create("tok_en-1"),
      code: LoginCode.create("012345"),
    },
    { appUrl: "https://lunt.jp", siteName: "Lunt", validForMs: 15 * 60_000 },
  );

  it("carries the link, the code and the lifetime in one mail", () => {
    expect(mail.to).toBe("a@example.com");
    expect(mail.subject).toBe("Lunt へのログイン");
    expect(mail.text).toContain("https://lunt.jp/login/link?token=tok_en-1");
    expect(mail.text).toContain("コード: 012345");
    expect(mail.text).toContain("15 分間");
    expect(mail.html).toContain(
      'href="https://lunt.jp/login/link?token=tok_en-1"',
    );
  });

  it("reads back as a person would", () => {
    expect(readLoginMail(mail.text, "https://lunt.jp")).toEqual({
      linkUrl: "https://lunt.jp/login/link?token=tok_en-1",
      linkToken: "tok_en-1",
      code: "012345",
    });
  });

  it("links under the app URL", () => {
    expect(
      loginLinkUrl("http://localhost:3000", LinkToken.create("a+b/c")),
    ).toBe("http://localhost:3000/login/link?token=a%2Bb%2Fc");
  });
});
