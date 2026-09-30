import { TextLink } from "@/components/ui/TextButton";

/** The other ways to explore (CS-02 / CS-09 of the viewer screens), by screen. */
const DESTINATIONS = {
  discover: { to: "/", label: "みつける" },
  search: { to: "/search", label: "キーワードで探す" },
  map: { to: "/map", label: "マップで探す" },
  regions: { to: "/regions", label: "まちから探す" },
  events: { to: "/events", label: "イベントを見る" },
  articles: { to: "/articles", label: "読みものを読む" },
  saved: { to: "/saved", label: "保存を見る" },
} as const satisfies Readonly<
  Record<string, Readonly<{ to: string; label: string }>>
>;

export type ExploreDestination = keyof typeof DESTINATIONS;

/** Text links to other ways to explore, in the order given. */
export function ExploreLinks({ to }: { to: readonly ExploreDestination[] }) {
  return (
    <>
      {to.map((key) => (
        <TextLink key={key} to={DESTINATIONS[key].to}>
          {DESTINATIONS[key].label}
        </TextLink>
      ))}
    </>
  );
}
