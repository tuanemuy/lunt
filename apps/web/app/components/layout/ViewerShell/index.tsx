import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { HomeLink } from "@/components/ui/HomeLink";
import { Icon } from "@/components/ui/Icon";
import { IconButtonLink } from "@/components/ui/IconButton";
import { Logo } from "@/components/ui/Logo";
import { BackButton } from "./BackButton";
import { VIEWER_PATHS, VIEWER_TABS, type ViewerTabKey } from "./nav";
import { BROWSE_PATHS, useBrowseConditions } from "./useBrowseConditions";

export type { ViewerTabKey } from "./nav";

/**
 * Header Type=Home for the five tab screens; Type=Detail (back, screen name,
 * search) for every other viewer screen.
 */
export type ViewerHeaderConfig =
  | { type: "home" }
  | { type: "detail"; title: string; backTo?: string };

type NavProps = {
  /** Marks a tab current when the URL alone does not (a detail opened from it). */
  current?: ViewerTabKey | undefined;
};

function currentProps(key: ViewerTabKey, current: ViewerTabKey | undefined) {
  return key === current ? { "aria-current": "page" as const } : {};
}

/**
 * The five tabs inside the header, shown from `lg`. VW-01, VW-04 and VW-05
 * open with the conditions last shown on any of them (CF-03).
 */
export function TopNav({ current }: NavProps) {
  const conditions = useBrowseConditions();
  return (
    <nav className="top-nav" aria-label="メインナビゲーション">
      <ul className="top-nav__list">
        {VIEWER_TABS.map((tab) => (
          <li key={tab.key}>
            <Link
              to={tab.to}
              search={() => (BROWSE_PATHS.has(tab.to) ? conditions : {})}
              className="top-nav__item"
              activeOptions={{ exact: tab.to === "/", includeSearch: false }}
              activeProps={{}}
              {...currentProps(tab.key, current)}
            >
              <Icon name={tab.icon} />
              {tab.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Lunt/BottomNavigation (19:181): the five tabs fixed to the bottom, below `lg`. */
export function BottomNav({ current }: NavProps) {
  const conditions = useBrowseConditions();
  return (
    <nav className="bottom-nav" aria-label="メインナビゲーション">
      <ul className="bottom-nav__list">
        {VIEWER_TABS.map((tab) => (
          <li key={tab.key}>
            <Link
              to={tab.to}
              search={() => (BROWSE_PATHS.has(tab.to) ? conditions : {})}
              className="nav-item"
              activeOptions={{ exact: tab.to === "/", includeSearch: false }}
              activeProps={{}}
              {...currentProps(tab.key, current)}
            >
              <Icon name={tab.icon} />
              {tab.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

type ViewerHeaderProps = NavProps & { header: ViewerHeaderConfig };

/** Lunt/Header (18:40). */
export function ViewerHeader({ header, current }: ViewerHeaderProps) {
  return (
    <header className="site-header" data-type={header.type}>
      <div className="site-header__bar site-header__bar--global">
        <HomeLink to="/" className="logo">
          <Logo />
        </HomeLink>
        <TopNav current={current} />
        <div className="site-header__actions">
          <IconButtonLink
            to={VIEWER_PATHS.search}
            icon="search"
            label="検索"
            neutral
          />
          <Link
            to={VIEWER_PATHS.account}
            className="account-link"
            activeProps={{}}
          >
            マイページ
          </Link>
        </div>
      </div>
      {header.type === "detail" ? (
        <div className="site-header__bar site-header__bar--local">
          <BackButton fallback={header.backTo ?? "/"} />
          <p className="site-header__title">{header.title}</p>
          <IconButtonLink
            to={VIEWER_PATHS.search}
            icon="search"
            label="検索"
            neutral
            className="site-header__search"
          />
        </div>
      ) : null}
    </header>
  );
}

type ViewerShellProps = NavProps & {
  header: ViewerHeaderConfig;
  children: ReactNode;
};

/**
 * The viewer frame (VW・DT): header, the page's own vertically scrolling
 * body, and the bottom navigation (a top navigation from `lg`). Children
 * lay themselves out in `.container`.
 */
export function ViewerShell({ header, current, children }: ViewerShellProps) {
  return (
    <div className="app">
      <ViewerHeader header={header} current={current} />
      <main className="page" id="main">
        {children}
      </main>
      <BottomNav current={current} />
    </div>
  );
}
