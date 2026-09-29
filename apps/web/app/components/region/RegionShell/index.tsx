"use client";

import { type ReactNode, useEffect } from "react";
import {
  ManageHeading,
  ManageNav,
  ManageNavItem,
  ManagePage,
  ManageShell,
  ManageTitle,
  ProxyBanner,
  StaticTarget,
} from "@/components/layout/ManageShell";
import { OpsSearchReturnLink } from "@/components/ops/OpsSearchReturn";
import { rememberProxyVisit } from "@/components/ops/ProxyReturn";
import { TextLink } from "@/components/ui/TextButton";
import {
  type RegionFrame,
  regionFrameStateText,
  regionNameText,
  regionPagePath,
} from "@/presentation/regionView";

/**
 * The key a region's absence proxy is remembered under for this tab
 * (`rememberProxyVisit`), apart from the stores' ids.
 */
export const regionProxyKey = (regionId: string): string =>
  `region:${regionId}`;

/** RM-01 of a region, the area's home. */
export const regionHomePath = (regionId: string): string =>
  `/manage/regions/${encodeURIComponent(regionId)}`;

/** The frame of the RM screens (brand band labelled 地域の運営). */
export function RegionShell({
  homeTo,
  children,
}: {
  /** RM-01 of the region, or MY-01 when no region is at hand. */
  homeTo: string;
  children: ReactNode;
}) {
  return (
    <ManageShell context="地域の運営" homeTo={homeTo}>
      {children}
    </ManageShell>
  );
}

/**
 * The absence proxy's way back (CS-14): OM-02's last search. Opening a
 * region by proxy marks it for this tab, so a later refusal of its RM
 * screens reads as the lost proxy (CS-15) rather than a stranger's CS-05.
 */
function RegionProxyReturn({ regionId }: { regionId: string }) {
  useEffect(() => rememberProxyVisit(regionProxyKey(regionId)), [regionId]);
  return <OpsSearchReturnLink />;
}

/**
 * 地域運営の管理ナビゲーション (所属店舗と申請 / 地域情報 / 関連イベント /
 * メンバー). While an operator stands in for an absent region steward
 * (CS-14) the nav says so, leads back to OM-02, and leaves メンバー out —
 * the operator opens CM-02 from OM-03.
 */
export function RegionNav({ frame }: { frame: RegionFrame }) {
  const params = { regionId: frame.regionId };
  const proxy = frame.basis === "proxy";
  return (
    <ManageNav
      label="地域の運営"
      {...(proxy
        ? {
            proxy: (
              <ProxyBanner label="不在の代行中">
                <RegionProxyReturn regionId={frame.regionId} />
              </ProxyBanner>
            ),
          }
        : {})}
      links={
        <>
          <TextLink to={regionPagePath(frame.regionId)}>
            閲覧者に見える地域ページ
          </TextLink>
          <TextLink to="/me">マイページ</TextLink>
        </>
      }
    >
      <ManageNavItem
        to="/manage/regions/$regionId"
        params={params}
        activeOptions={{ exact: true }}
        activeProps={{ "aria-current": "page" }}
      >
        所属店舗と申請
      </ManageNavItem>
      <ManageNavItem
        to="/manage/regions/$regionId/info"
        params={params}
        activeProps={{ "aria-current": "page" }}
      >
        地域情報
      </ManageNavItem>
      <ManageNavItem
        to="/manage/regions/$regionId/events"
        params={params}
        activeProps={{ "aria-current": "page" }}
      >
        関連イベント
      </ManageNavItem>
      {proxy ? null : (
        <ManageNavItem
          to="/manage/regions/$regionId/members"
          params={params}
          activeProps={{ "aria-current": "page" }}
        >
          メンバー
        </ManageNavItem>
      )}
    </ManageNav>
  );
}

/** The managed region in the title band. */
export function RegionTarget({ frame }: { frame: RegionFrame }) {
  return (
    <StaticTarget
      name={regionNameText(frame.name)}
      status={regionFrameStateText(frame)}
    />
  );
}

type RegionPageProps = {
  frame: RegionFrame;
  heading: string;
  children: ReactNode;
  actions?: ReactNode;
  actionsNote?: ReactNode;
};

/** One RM screen: the region in the title band, the body, the dock and the region nav. */
export function RegionPage({
  frame,
  heading,
  children,
  actions,
  actionsNote,
}: RegionPageProps) {
  return (
    <ManagePage
      title={
        <ManageTitle>
          <RegionTarget frame={frame} />
          <ManageHeading>{heading}</ManageHeading>
        </ManageTitle>
      }
      nav={<RegionNav frame={frame} />}
      {...(actions === undefined ? {} : { actions })}
      {...(actionsNote === undefined ? {} : { actionsNote })}
    >
      {children}
    </ManagePage>
  );
}
