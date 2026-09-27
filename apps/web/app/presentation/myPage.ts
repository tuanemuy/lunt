import type { Role } from "@repo/core/domain/authority/role";
import type { StewardedKind } from "@repo/core/domain/common/refs";

/** A stewarded target as MY-01 lists it. */
export type MyPageTarget = Readonly<{
  kind: StewardedKind;
  id: string;
  /** `null` for an unnamed draft. */
  name: string | null;
}>;

/** What MY-01 shows: its two states (`spec/pages/account.md`). */
export type MyPageData =
  | Readonly<{ kind: "guest"; devTools: boolean }>
  | Readonly<{
      kind: "member";
      email: string;
      roles: readonly Role[];
      stewarded: readonly MyPageTarget[];
      devTools: boolean;
    }>;

/** One entry of MY-01; `to` is `null` while its screen is not built yet. */
export type MyPageEntry = Readonly<{
  key: string;
  title: string;
  meta?: string;
  to: string | null;
}>;

export type MyPageSection = Readonly<{
  id: string;
  title: string;
  entries: readonly MyPageEntry[];
}>;

const TARGET_SECTIONS = [
  { kind: "place", id: "my-places", title: "管理する店舗" },
  { kind: "region", id: "my-regions", title: "運営する地域" },
  { kind: "occasion", id: "my-occasions", title: "運営するイベント" },
] as const satisfies ReadonlyArray<
  Readonly<{ kind: StewardedKind; id: string; title: string }>
>;

/**
 * The role entries (`spec/pages/index.md` 「マイページからの入口」): the
 * operator's opens OM-01 (`/ops`, which stands in with OM-07 until OM-01's
 * stage); the editor's AM-01 comes with the editorial stage.
 */
const ROLE_ENTRIES: Readonly<Record<Role, MyPageEntry>> = {
  editor: {
    key: "editor",
    title: "読みもの編集",
    meta: "編集担当者",
    to: null,
  },
  operator: {
    key: "operator",
    title: "サービス運営",
    meta: "サービス運営者",
    to: "/ops",
  },
};

/**
 * What every logged-in account has (「マイページからの入口」 ログインしている).
 * MY-04 (自分の申請) joins with the application stage.
 */
const INBOX_SECTION: MyPageSection = {
  id: "my-inbox",
  title: "お知らせと申請",
  entries: [
    {
      key: "notifications",
      title: "通知",
      meta: "申請の結果、招待、確認の依頼など",
      to: "/me/notifications",
    },
  ],
};

/**
 * The sections of the logged-in MY-01: the notifications, then one section
 * per kind of stewarded target (by name) and one for the roles — those only
 * for the authority held (CS-05: no entry without the authority).
 */
export function myPageSections(
  roles: readonly Role[],
  stewarded: readonly MyPageTarget[],
): readonly MyPageSection[] {
  const targetSections = TARGET_SECTIONS.map(({ kind, id, title }) => ({
    id,
    title,
    entries: stewarded
      .filter((target) => target.kind === kind)
      .map(
        (target): MyPageEntry => ({
          key: `${target.kind}:${target.id}`,
          title: target.name ?? "名称未設定",
          to: null,
        }),
      ),
  }));
  const roleSection: MyPageSection = {
    id: "my-roles",
    title: "役割",
    entries: roles.map((role) => ROLE_ENTRIES[role]),
  };
  return [
    INBOX_SECTION,
    ...[...targetSections, roleSection].filter(
      (section) => section.entries.length > 0,
    ),
  ];
}
