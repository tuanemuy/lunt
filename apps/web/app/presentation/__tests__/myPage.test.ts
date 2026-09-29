import { describe, expect, it } from "vitest";
import { myPageSections, SHOP_ENTRY } from "../myPage";

const titles = (sections: ReturnType<typeof myPageSections>) =>
  sections.map((section) => section.title);

describe("myPageSections", () => {
  it("shows only the notifications and applications for an account without authority", () => {
    const sections = myPageSections([], []);
    expect(titles(sections)).toEqual(["お知らせと申請"]);
    expect(sections[0]?.entries).toEqual([
      expect.objectContaining({ title: "通知", to: "/me/notifications" }),
      expect.objectContaining({ title: "自分の申請", to: "/me/applications" }),
    ]);
  });

  it("shows the operator entry leading to role management", () => {
    const sections = myPageSections(["operator"], []);
    expect(titles(sections)).toEqual(["お知らせと申請", "役割"]);
    expect(sections[1]?.entries).toEqual([
      expect.objectContaining({ title: "サービス運営", to: "/ops" }),
    ]);
  });

  it("lists the roles in the order given, without a destination for editors yet", () => {
    const sections = myPageSections(["editor", "operator"], []);
    expect(sections[1]?.entries.map((entry) => [entry.key, entry.to])).toEqual([
      ["editor", null],
      ["operator", "/ops"],
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

  it("opens SM-01 from a stewarded store, RM-01 from a region and EM-01 from an event", () => {
    const sections = myPageSections(
      [],
      [
        { kind: "place", id: "p 1", name: "喫茶 日々" },
        { kind: "region", id: "r1", name: "こもれび商店街" },
        { kind: "occasion", id: "o1", name: "秋のよりみち市" },
      ],
    );
    expect(sections.slice(1).map((section) => section.entries[0]?.to)).toEqual([
      "/manage/places/p%201",
      "/manage/regions/r1",
      "/manage/events/o1",
    ]);
  });
});

describe("SHOP_ENTRY", () => {
  it("opens RQ-01", () => {
    expect(SHOP_ENTRY.to).toBe("/apply/find-place");
  });
});
