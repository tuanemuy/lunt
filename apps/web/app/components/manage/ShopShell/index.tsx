import type { ReactNode } from "react";
import {
  ManageHeading,
  ManageNav,
  ManageNavItem,
  ManagePage,
  ManageShell,
  ManageTitle,
  ProxyBanner,
  StaticTarget,
  TargetSwitcher,
  TargetSwitcherItem,
  TargetSwitcherRule,
} from "@/components/layout/ManageShell";
import { ProxyReturnLink } from "@/components/ops/ProxyReturn";
import { TextLink } from "@/components/ui/TextButton";
import {
  frameStateText,
  type PlaceFrame,
  placeStateText,
} from "@/presentation/placeView";

/**
 * DT-02, the store's page as viewers see it. A plain path: the detail
 * screens belong to the viewer area and are typed once they exist.
 */
export const placePagePath = (placeId: string): string => `/places/${placeId}`;

/** DT-01, a listing's page as viewers see it (see `placePagePath`). */
export const listingPagePath = (listingId: string): string =>
  `/listings/${listingId}`;

/** CM-02 for a store (see `placePagePath`). */
export const placeMembersPath = (placeId: string): string =>
  `/manage/places/${placeId}/members`;

/** The frame of the SM screens (brand band labelled お店の管理). */
export function ShopShell({
  homeTo,
  children,
}: {
  /** SM-01 of the store, or MY-01 when no store is at hand. */
  homeTo: string;
  children: ReactNode;
}) {
  return (
    <ManageShell context="お店の管理" homeTo={homeTo}>
      {children}
    </ManageShell>
  );
}

/**
 * 店舗側の管理ナビゲーション (D-07: ホーム / 掲載 / イベント / 店舗情報).
 * While an operator stands in for an absent steward (CS-14) the nav says
 * so and leads back to OM-02, or to OM-05 when the report being handled
 * opened the proxy; SM-01 and SM-06 are not opened by proxy, so ホーム and
 * イベント are left out.
 */
export function ShopNav({ frame }: { frame: PlaceFrame }) {
  const params = { placeId: frame.placeId };
  const proxy = frame.basis === "proxy";
  return (
    <ManageNav
      label="店舗の管理"
      {...(proxy
        ? {
            proxy: (
              <ProxyBanner label="不在の代行中">
                <ProxyReturnLink placeId={frame.placeId} />
              </ProxyBanner>
            ),
          }
        : {})}
      links={
        <>
          <TextLink to={placePagePath(frame.placeId)}>
            閲覧者に見える店舗ページ
          </TextLink>
          <TextLink to="/me">マイページ</TextLink>
        </>
      }
    >
      {proxy ? null : (
        <ManageNavItem
          to="/manage/places/$placeId"
          params={params}
          activeOptions={{ exact: true }}
          activeProps={{ "aria-current": "page" }}
        >
          ホーム
        </ManageNavItem>
      )}
      <ManageNavItem
        to="/manage/places/$placeId/listings"
        params={params}
        activeProps={{ "aria-current": "page" }}
      >
        掲載
      </ManageNavItem>
      {proxy ? null : (
        <ManageNavItem
          to="/manage/places/$placeId/events"
          params={params}
          activeProps={{ "aria-current": "page" }}
        >
          イベント
        </ManageNavItem>
      )}
      <ManageNavItem
        to="/manage/places/$placeId/info"
        params={params}
        activeProps={{ "aria-current": "page" }}
      >
        店舗情報
      </ManageNavItem>
    </ManageNav>
  );
}

/**
 * The managed store in the title band: a switcher among the stores the
 * steward manages, or the store alone while acting by proxy.
 */
export function ShopTarget({
  frame,
  asHeading = false,
}: {
  frame: PlaceFrame;
  /** The store's name is the page heading (SM-01). */
  asHeading?: boolean;
}) {
  if (frame.basis === "proxy") {
    return <StaticTarget name={frame.name} status={frameStateText(frame)} />;
  }
  return (
    <TargetSwitcher
      name={frame.name}
      status={placeStateText(frame)}
      asHeading={asHeading}
      caption="管理する店舗"
      switchLabel="管理する店舗を切り替える"
    >
      {frame.stewarded.map((place) => (
        <TargetSwitcherItem
          key={place.placeId}
          to="/manage/places/$placeId"
          params={{ placeId: place.placeId }}
          name={place.name}
          status={placeStateText(place)}
          {...(place.placeId === frame.placeId
            ? { "aria-current": "true" as const }
            : {})}
        />
      ))}
      <TargetSwitcherRule />
      <TargetSwitcherItem
        to={placePagePath(frame.placeId)}
        name="閲覧者に見える店舗ページ"
      />
    </TargetSwitcher>
  );
}

type ShopPageProps = {
  frame: PlaceFrame;
  /** The page heading; omit on SM-01, whose heading is the store's name. */
  heading?: string;
  children: ReactNode;
  actions?: ReactNode;
  actionsNote?: ReactNode;
};

/** One SM screen: the store in the title band, the body, the dock and the store nav. */
export function ShopPage({
  frame,
  heading,
  children,
  actions,
  actionsNote,
}: ShopPageProps) {
  return (
    <ManagePage
      title={
        <ManageTitle>
          <ShopTarget frame={frame} asHeading={heading === undefined} />
          {heading === undefined ? null : (
            <ManageHeading>{heading}</ManageHeading>
          )}
        </ManageTitle>
      }
      nav={<ShopNav frame={frame} />}
      {...(actions === undefined ? {} : { actions })}
      {...(actionsNote === undefined ? {} : { actionsNote })}
    >
      {children}
    </ManagePage>
  );
}
