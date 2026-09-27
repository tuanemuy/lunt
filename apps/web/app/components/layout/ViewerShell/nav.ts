import type { IconName } from "@/components/ui/Icon";

export type ViewerTabKey =
  | "discover"
  | "map"
  | "regions"
  | "articles"
  | "saved";

type ViewerTab = {
  key: ViewerTabKey;
  label: string;
  icon: IconName;
  // Plain paths: most tab screens arrive in later phases, and the router only
  // type-checks literal paths it already knows.
  to: string;
};

/** The five viewer tabs, in the order of the bottom and top navigation. */
export const VIEWER_TABS: ReadonlyArray<ViewerTab> = [
  { key: "discover", label: "みつける", icon: "compass", to: "/" },
  { key: "map", label: "マップ", icon: "map", to: "/map" },
  { key: "regions", label: "まち", icon: "region", to: "/regions" },
  { key: "articles", label: "読む", icon: "book", to: "/articles" },
  { key: "saved", label: "保存", icon: "bookmark", to: "/saved" },
];

export const VIEWER_PATHS: Readonly<{ search: string; account: string }> = {
  search: "/search",
  account: "/me",
};
