import { EmailAddress } from "@repo/core/domain/common/emailAddress";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { expectBusinessError } from "./expectBusinessError";

const CODE = "COMMON_INVALID_EMAIL_ADDRESS";

const withLength = (length: number): string => {
  const domain = "@example.com";
  return `${"a".repeat(length - domain.length)}${domain}`;
};

describe("EmailAddress.create (trim, lowercase, well-formed, ≤254)", () => {
  it("trims and lowercases", () => {
    expect(EmailAddress.create("  User.A+tag@Example.COM \n")).toBe(
      "user.a+tag@example.com",
    );
  });

  it("equality is value equality after normalisation", () => {
    expect(
      EmailAddress.equals(
        EmailAddress.create("A@EXAMPLE.com"),
        EmailAddress.create("a@example.com"),
      ),
    ).toBe(true);
  });

  it("accepts exactly 254 characters and rejects 255", () => {
    expect(EmailAddress.create(withLength(254))).toHaveLength(254);
    expectBusinessError(() => EmailAddress.create(withLength(255)), CODE);
  });

  it("the 254 limit applies after trimming", () => {
    expect(EmailAddress.create(`  ${withLength(254)}  `)).toHaveLength(254);
  });

  it.each([
    ["empty", ""],
    ["blank", "   "],
    ["no @", "user.example.com"],
    ["two @", "a@b@example.com"],
    ["empty local part", "@example.com"],
    ["empty domain", "user@"],
    ["dotless domain", "user@example"],
    ["space inside", "us er@example.com"],
    ["domain label starting with hyphen", "user@-example.com"],
    ["trailing dot in domain", "user@example.com."],
    ["non-ASCII / emoji", "😀@example.com"],
    ["HTML tag", "<b>@example.com"],
  ])("rejects a malformed address: %s", (_label, raw) => {
    expectBusinessError(() => EmailAddress.create(raw), CODE);
  });

  it("output is always trimmed, lowercase and within 254", () => {
    fc.assert(
      fc.property(fc.emailAddress(), (raw) => {
        let value: string;
        try {
          value = EmailAddress.create(raw.toUpperCase());
        } catch {
          return;
        }
        expect(value).toBe(value.trim().toLowerCase());
        expect(value.length).toBeLessThanOrEqual(254);
      }),
    );
  });
});
