import type { ReactNode } from "react";
import {
  ManageNav,
  ManageNavItem,
  ManageShell,
} from "@/components/layout/ManageShell";
import { TextLink } from "@/components/ui/TextButton";

/**
 * The service-operation screens that exist so far, in the nav's order
 * (対応が必要なもの / 対象を探す / カテゴリー / 役割): OM-01, OM-02 and OM-06
 * join as their stages land.
 */
const OPS_NAV = [{ to: "/ops/roles", label: "役割" }] as const;

/** The home of the service-operation area: its first screen that exists. */
export const OPS_HOME = OPS_NAV[0].to;

/** The frame of the OM screens (brand band labelled サービス運営). */
export function OpsShell({ children }: { children: ReactNode }) {
  return (
    <ManageShell context="サービス運営" homeTo={OPS_HOME}>
      {children}
    </ManageShell>
  );
}

/** 運営のナビゲーション, for `ManagePage`'s `nav`. */
export function OpsNav() {
  return (
    <ManageNav
      label="サービス運営"
      links={<TextLink to="/me">マイページ</TextLink>}
    >
      {OPS_NAV.map((item) => (
        <ManageNavItem
          key={item.to}
          to={item.to}
          activeProps={{ "aria-current": "page" }}
        >
          {item.label}
        </ManageNavItem>
      ))}
    </ManageNav>
  );
}
