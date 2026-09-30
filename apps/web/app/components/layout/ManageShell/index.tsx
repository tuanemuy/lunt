import { createLink, Link } from "@tanstack/react-router";
import type { ComponentProps, ReactNode } from "react";
import { cx } from "@/components/ui/cx";
import { DonePanel } from "@/components/ui/DonePanel";
import { HomeLink } from "@/components/ui/HomeLink";
import { Icon } from "@/components/ui/Icon";
import { Logo } from "@/components/ui/Logo";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { ManageDock } from "./ManageDock";

const ACCOUNT_PATH = "/me";

type ManageShellProps = {
  /** The brand band's context label: お店の管理, 地域の運営, サービス運営, アカウント… */
  context: string;
  /** Where the logo and context label lead (the context's home). */
  homeTo: string;
  /** The マイページ entry at the brand band's end. Off on MY-01, MY-02 and RQ-07. */
  accountLink?: boolean;
  /** Forces the single-column layout; a page without a `ManageNav` gets it anyway. */
  solo?: boolean;
  /** One `ManagePage` or `DoneScreen`. */
  children: ReactNode;
};

/**
 * The management frame (Brand bar 72:3310). The page inside supplies the
 * title band, body, and dock through `ManagePage`; from `lg` the brand spans
 * the top, a `ManageNav` becomes the 240px left column and the body is
 * capped at 720px.
 */
export function ManageShell({
  context,
  homeTo,
  accountLink = true,
  solo = false,
  children,
}: ManageShellProps) {
  return (
    <div className={cx("m-app", solo && "m-app--solo")}>
      <header className="m-brand">
        <HomeLink to={homeTo} className="m-brand__home">
          <span className="m-brand__logo">
            <Logo />
          </span>
          <span className="m-brand__label">{context}</span>
        </HomeLink>
        {accountLink ? (
          <Link to={ACCOUNT_PATH} className="m-brand__account" activeProps={{}}>
            マイページ
          </Link>
        ) : null}
      </header>
      {children}
    </div>
  );
}

/** The frame of the application and report screens (RQ), which have no management nav. */
export function SoloShell(props: Omit<ManageShellProps, "solo">) {
  return <ManageShell {...props} solo />;
}

type ManagePageProps = {
  /** A `ManageTitle`. */
  title: ReactNode;
  /** `ManageBody` blocks, or a `DonePanel` / `EmptyPanel` in their place. */
  children: ReactNode;
  /** The screen's main operations (Actions 72:3323): fixed to the bottom on mobile, after the body from `lg`. */
  actions?: ReactNode;
  /** A line above the actions, e.g. the CS-11 unsaved-changes warning. */
  actionsNote?: ReactNode;
  /** A `ManageNav`. */
  nav?: ReactNode;
};

/** One management screen inside `ManageShell`: title band, body, and the dock of actions and nav. */
export function ManagePage({
  title,
  children,
  actions,
  actionsNote,
  nav,
}: ManagePageProps) {
  const hasActions = actions !== undefined;
  return (
    <>
      <main className="m-main" id="main">
        {title}
        {children}
      </main>
      {hasActions || nav !== undefined ? (
        <ManageDock>
          {hasActions ? (
            <div className="m-actions">
              {actionsNote === undefined ? null : (
                <p className="m-actions__note">{actionsNote}</p>
              )}
              {actions}
            </div>
          ) : null}
          {nav}
        </ManageDock>
      ) : null}
    </>
  );
}

/** The title band (72:3319): back entry, target switcher, heading and status lines. */
export function ManageTitle({ children }: { children: ReactNode }) {
  return <div className="m-title">{children}</div>;
}

export function ManageHeading({ children }: { children: ReactNode }) {
  return <h1 className="m-title__heading">{children}</h1>;
}

type ManageStatusProps = {
  /** `accent` (green, the default) for a healthy state, `neutral` for a paused one, `alert` for trouble. */
  tone?: "accent" | "neutral" | "alert";
  children: ReactNode;
};

/** The target's state line (営業中 · 店舗ページ公開中). */
export function ManageStatus({ tone = "accent", children }: ManageStatusProps) {
  return (
    <p className="m-status" data-tone={tone === "accent" ? undefined : tone}>
      {children}
    </p>
  );
}

function BackAnchor({ className, children, ...rest }: ComponentProps<"a">) {
  return (
    <a className={cx("m-back", className)} {...rest}>
      <Icon name="back" />
      {children}
    </a>
  );
}

/** The title band's 戻る entry (account screens). */
export const ManageBackLink = createLink(BackAnchor);

type TargetSwitcherProps = {
  name: string;
  /** The target's state, e.g. 営業中 · 公開中. */
  status?: string;
  /** The name is the page heading itself (店舗ホーム). */
  asHeading?: boolean;
  /** e.g. 管理する店舗 */
  caption: string;
  /** e.g. 管理する店舗を切り替える */
  switchLabel: string;
  /** `TargetSwitcherItem`s, optionally followed by `TargetSwitcherRule` and further entries. */
  children: ReactNode;
};

/**
 * The managed target with a switcher for people who manage several
 * (a `<details>` disclosure, so it works without script).
 */
export function TargetSwitcher({
  name,
  status,
  asHeading = false,
  caption,
  switchLabel,
  children,
}: TargetSwitcherProps) {
  const Name = asHeading ? "h1" : "span";
  return (
    <details className={cx("m-target", asHeading && "m-target--heading")}>
      <summary>
        <Name className="m-target__name">{name}</Name>
        {status === undefined ? null : (
          <span className="m-target__state">{status}</span>
        )}
        <Icon name="down" className="m-target__icon" />
        <span className="sr-only">{switchLabel}</span>
      </summary>
      <div className="m-target__menu">
        <p className="m-target__caption">{caption}</p>
        {children}
      </div>
    </details>
  );
}

function TargetSwitcherAnchor({
  name,
  status,
  className,
  ...rest
}: Omit<ComponentProps<"a">, "children"> & { name: string; status?: string }) {
  return (
    <a className={cx("m-target__item", className)} {...rest}>
      <span className="m-target__name">{name}</span>
      {status === undefined ? null : (
        <span className="m-target__state">{status}</span>
      )}
    </a>
  );
}

export const TargetSwitcherItem = createLink(TargetSwitcherAnchor);

export function TargetSwitcherRule() {
  return <div className="m-target__rule" role="presentation" />;
}

/** The managed target without a switcher (a single target, or while acting for an absent manager). */
export function StaticTarget({
  name,
  status,
}: {
  name: string;
  status?: string;
}) {
  return (
    <p className="m-target m-target--static">
      <span className="m-target__name">{name}</span>
      {status === undefined ? null : (
        <span className="m-target__state">{status}</span>
      )}
    </p>
  );
}

/** A `.m-body` block: the vertical 24px rhythm with the gutter. */
export function ManageBody({ className, ...rest }: ComponentProps<"div">) {
  return <div className={cx("m-body", className)} {...rest} />;
}

type ManageSectionProps = {
  id: string;
  title: string;
  children: ReactNode;
};

/** A titled section of the body; the heading labels the region. */
export function ManageSection({ id, title, children }: ManageSectionProps) {
  return (
    <section className="m-section" aria-labelledby={id}>
      <SectionTitle variant="manage" id={id}>
        {title}
      </SectionTitle>
      {children}
    </section>
  );
}

type ManageNavProps = {
  /** e.g. 店舗の管理 */
  label: string;
  /** A `ProxyBanner` while a service operator acts for an absent manager (CS-14). */
  proxy?: ReactNode;
  /** Extra entries under the left nav from `lg` (閲覧者に見える店舗ページ, マイページ). */
  links?: ReactNode;
  /** Up to four `ManageNavItem`s. */
  children?: ReactNode;
};

/**
 * The management nav (77:3396): four equal items in the dock on mobile,
 * a vertical list in the left column from `lg`.
 */
export function ManageNav({ label, proxy, links, children }: ManageNavProps) {
  return (
    <nav className="m-nav" aria-label={label}>
      {proxy}
      {children === undefined ? null : (
        <div className="m-nav__items">{children}</div>
      )}
      {links === undefined ? null : <div className="m-nav__links">{links}</div>}
    </nav>
  );
}

function ManageNavAnchor({ className, ...rest }: ComponentProps<"a">) {
  return <a className={cx("m-nav__item", className)} {...rest} />;
}

export const ManageNavItem = createLink(ManageNavAnchor);

type ProxyBannerProps = {
  /** e.g. 不在の代行中 */
  label: string;
  /** The way back to where the proxy was opened (OM-02 / OM-05), a `TextLink`. */
  children: ReactNode;
};

/** The acting-for-an-absent-manager marker at the head of the management nav (CS-14). */
export function ProxyBanner({ label, children }: ProxyBannerProps) {
  return (
    <div className="m-proxy">
      <span className="m-proxy__label">{label}</span>
      {children}
    </div>
  );
}

type DoneScreenProps = {
  title: string;
  children?: ReactNode;
  actions: ReactNode;
};

/**
 * A completion that replaces the whole screen (the 状態/… frames): the brand,
 * title band and dock step aside and the `DonePanel` is centred.
 */
export function DoneScreen({ title, children, actions }: DoneScreenProps) {
  return (
    <main className="m-screen" id="main">
      <DonePanel title={title} actions={actions} headingLevel="h1">
        {children}
      </DonePanel>
    </main>
  );
}
