import type { ReactNode } from "react";
import {
  ManageNav,
  ManageNavItem,
  ManageShell,
} from "@/components/layout/ManageShell";
import { TextLink } from "@/components/ui/TextButton";

/** The home of the service-operation area: OM-01's URL. */
export const OPS_HOME = "/ops";

/** 運営のナビゲーション's items, in order (対応が必要なもの / 対象を探す / カテゴリー / 役割). */
const OPS_NAV = [
  { to: OPS_HOME, label: "対応が必要なもの" },
  { to: "/ops/search", label: "対象を探す" },
  { to: "/ops/categories", label: "カテゴリー" },
  { to: "/ops/roles", label: "役割" },
] as const;

/** The frame of the OM screens (brand band labelled サービス運営). */
export function OpsShell({ children }: { children: ReactNode }) {
  return (
    <ManageShell context="サービス運営" homeTo={OPS_HOME}>
      {children}
    </ManageShell>
  );
}

/**
 * 運営のナビゲーション, for `ManagePage`'s `nav`. `current="inbox"` marks
 * 対応が必要なもの on the screens its rows open (OM-04, OM-05).
 */
export function OpsNav({ current }: { current?: "inbox" } = {}) {
  return (
    <ManageNav
      label="サービス運営"
      links={<TextLink to="/me">マイページ</TextLink>}
    >
      {OPS_NAV.map((item) => (
        <ManageNavItem
          key={item.to}
          to={item.to}
          activeOptions={{ exact: item.to === OPS_HOME }}
          activeProps={{ "aria-current": "page" }}
          {...(item.to === OPS_HOME && current === "inbox"
            ? { "aria-current": "page" as const }
            : {})}
        >
          {item.label}
        </ManageNavItem>
      ))}
    </ManageNav>
  );
}
