import { describe, expect, it } from "vitest";
import { myPageSections } from "../myPage";

const titles = (sections: ReturnType<typeof myPageSections>) =>
  sections.map((section) => section.title);

describe("myPageSections", () => {
  it("shows only the notifications for an account without authority", () => {
    const sections = myPageSections([], []);
    expect(titles(sections)).toEqual(["お知らせと申請"]);
    expect(sections[0]?.entries).toEqual([
      expect.objectContaining({ title: "通知", to: "/me/notifications" }),
    ]);
  });

  it("shows the operator entry leading to role management", () => {
    const sections = myPageSections(["operator"], []);
    expect(titles(sections)).toEqual(["お知らせと申請", "役割"]);
    expect(sections[1]?.entries).toEqual([
      expect.objectContaining({ title: "サービス運営", to: "/ops/roles" }),
    ]);
  });

  it("lists the roles in the order given, without a destination for editors yet", () => {
    const sections = myPageSections(["editor", "operator"], []);
    expect(sections[1]?.entries.map((entry) => [entry.key, entry.to])).toEqual([
      ["editor", null],
      ["operator", "/ops/roles"],
    ]);
  });

  it("groups stewarded targets by kind before the roles, naming unnamed drafts", () => {
    const sections = myPageSections(
      ["editor"],
      [
        { kind: "region", id: "r1", name: "こもれび商店街" },
        { kind: "place", id: "p1", name: null },
      ],
    );
    expect(titles(sections)).toEqual([
      "お知らせと申請",
      "管理する店舗",
      "運営する地域",
      "役割",
    ]);
    expect(sections[1]?.entries[0]?.title).toBe("名称未設定");
  });
});
