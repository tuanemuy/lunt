import type { IconName } from "@/components/ui/Icon";
import type { FileRoutesByTo } from "@/routeTree.gen";

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
  to: keyof FileRoutesByTo;
};

/** The five viewer tabs, in the order of the bottom and top navigation. */
export const VIEWER_TABS: ReadonlyArray<ViewerTab> = [
  { key: "discover", label: "みつける", icon: "compass", to: "/" },
  { key: "map", label: "マップ", icon: "map", to: "/map" },
  { key: "regions", label: "まち", icon: "region", to: "/regions" },
  { key: "articles", label: "読む", icon: "book", to: "/articles" },
  { key: "saved", label: "保存", icon: "bookmark", to: "/saved" },
];

export const VIEWER_PATHS: Readonly<{
  search: keyof FileRoutesByTo;
  account: keyof FileRoutesByTo;
}> = {
  search: "/search",
  account: "/me",
};
