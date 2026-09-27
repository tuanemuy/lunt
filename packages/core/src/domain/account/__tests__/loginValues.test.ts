import { expectBusinessError } from "@repo/core/domain/common/__tests__/expectBusinessError";
import { EmailAddress } from "@repo/core/domain/common/emailAddress";
import { describe, expect, it } from "vitest";
import { Account } from "../entity";
import { ExternalProviderKey } from "../externalIdentity";
import { LoginChallengeId } from "../loginChallenge";
import { LoginPolicy } from "../loginPolicy";
import { LinkToken, LoginCode, SecretDigest } from "../loginSecret";

const ID = "ffffffff-ffff-7fff-8fff-000000000001";

describe("login secrets", () => {
  it("LinkToken and LoginCode trim and refuse blanks", () => {
    expect(LinkToken.create("  abc ")).toBe("abc");
    expect(LoginCode.create(" 123456 ")).toBe("123456");
    for (const create of [LinkToken.create, LoginCode.create]) {
      expectBusinessError(() => create("  "), "ACCOUNT_INVALID_LOGIN_SECRET");
    }
  });

  it("SecretDigest refuses blanks and surrounding whitespace", () => {
    expect(SecretDigest.create("d")).toBe("d");
    for (const raw of ["", " d", "d "]) {
      expectBusinessError(
        () => SecretDigest.create(raw),
        "ACCOUNT_INVALID_LOGIN_SECRET",
      );
    }
  });

  it("LoginChallengeId refuses blanks", () => {
    expect(LoginChallengeId.create(ID)).toBe(ID);
    expectBusinessError(
      () => LoginChallengeId.create(" "),
      "COMMON_INVALID_INPUT",
    );
  });
});

describe("ExternalProviderKey", () => {
  it("trims and refuses blanks", () => {
    expect(ExternalProviderKey.create(" google ")).toBe("google");
    expectBusinessError(
      () => ExternalProviderKey.create(""),
      "ACCOUNT_INVALID_EXTERNAL_PROVIDER_KEY",
    );
  });
});

describe("LoginPolicy", () => {
  const email = EmailAddress.create("a@example.com");

  it("resolve returns the existing account without registering", () => {
    const existing = Account.register({ id: ID, email });
    expect(
      LoginPolicy.resolve(
        email,
        existing,
        "ffffffff-ffff-7fff-8fff-000000000002",
      ),
    ).toEqual({ account: existing, registered: false });
  });

  it("resolve registers a new account with the given id when none exists", () => {
    expect(LoginPolicy.resolve(email, null, ID)).toEqual({
      account: Account.register({ id: ID, email }),
      registered: true,
    });
  });

  it("fromExternal passes a verified address and refuses the rest", () => {
    expect(LoginPolicy.fromExternal({ outcome: "verified", email })).toBe(
      email,
    );
    expectBusinessError(
      () => LoginPolicy.fromExternal({ outcome: "email_unavailable" }),
      "ACCOUNT_VERIFIED_EMAIL_REQUIRED",
    );
    expectBusinessError(
      () => LoginPolicy.fromExternal({ outcome: "not_authenticated" }),
      "ACCOUNT_EXTERNAL_LOGIN_NOT_AUTHENTICATED",
    );
  });
});
