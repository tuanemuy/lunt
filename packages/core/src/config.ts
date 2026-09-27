import type { AppConfig } from "@repo/core/application/di/types";

export const content: Omit<AppConfig, "appUrl"> = {
  siteName: "Lunt",
  defaultTitle: "Lunt",
  defaultDescription:
    "写真から、まちのお店・掲載・地域・イベント・読みものを見つける。",
  themeColor: "#ffffff",
};
