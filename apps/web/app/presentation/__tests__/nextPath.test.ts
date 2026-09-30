import { describe, expect, it } from "vitest";
import { DEFAULT_AFTER_LOGIN, loginDonePath, safeNextPath } from "../nextPath";

describe("safeNextPath", () => {
  it("keeps a same-origin path with its query and hash", () => {
    expect(safeNextPath("/manage/places/p1/info?tab=a#top")).toBe(
      "/manage/places/p1/info?tab=a#top",
    );
  });

  it("falls back to MY-01 for anything that could leave the site", () => {
    for (const raw of [
      "https://evil.example/",
      "//evil.example/path",
      "/\\evil.example",
      "javascript:alert(1)",
      "relative/path",
      "/a\nb",
      "",
      undefined,
      42,
      `/${"x".repeat(3000)}`,
    ]) {
      expect(safeNextPath(raw)).toBe(DEFAULT_AFTER_LOGIN);
    }
  });

  it("keeps percent-encoded characters encoded", () => {
    expect(safeNextPath("/%0d%0aSet-Cookie:x")).toBe("/%0d%0aSet-Cookie:x");
  });

  it("does not return to the login screen itself", () => {
    expect(safeNextPath("/login?next=/me")).toBe(DEFAULT_AFTER_LOGIN);
  });

  it("does not return to any screen under the login path", () => {
    expect(safeNextPath("/login/")).toBe(DEFAULT_AFTER_LOGIN);
    expect(safeNextPath("/login/link?token=attacker")).toBe(
      DEFAULT_AFTER_LOGIN,
    );
    expect(safeNextPath("/login/external/google")).toBe(DEFAULT_AFTER_LOGIN);
    expect(safeNextPath("/LOGIN/link?token=attacker")).toBe(
      DEFAULT_AFTER_LOGIN,
    );
    expect(safeNextPath("/%6Cogin/link?token=attacker")).toBe(
      DEFAULT_AFTER_LOGIN,
    );
  });

  it("keeps paths that only start with the same letters", () => {
    expect(safeNextPath("/loginhelp")).toBe("/loginhelp");
  });
});

describe("loginDonePath", () => {
  it("carries the safe return path to MY-02's last step", () => {
    expect(loginDonePath("/saved")).toBe("/login/done?next=%2Fsaved");
    expect(loginDonePath("/places/p1?tab=a#top")).toBe(
      "/login/done?next=%2Fplaces%2Fp1%3Ftab%3Da%23top",
    );
    expect(loginDonePath("https://evil.example/")).toBe(
      `/login/done?next=${encodeURIComponent(DEFAULT_AFTER_LOGIN)}`,
    );
    expect(loginDonePath("/login/done?next=/me")).toBe(
      `/login/done?next=${encodeURIComponent(DEFAULT_AFTER_LOGIN)}`,
    );
  });
});
