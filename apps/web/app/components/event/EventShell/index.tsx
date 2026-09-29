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
} from "@/components/layout/ManageShell";
import { ProxyReturnLink } from "@/components/ops/ProxyReturn";
import { TextLink } from "@/components/ui/TextButton";
import {
  type OccasionFrame,
  occasionFrameStateText,
  occasionName,
} from "@/presentation/occasionView";

/**
 * DT-04, the event's page as viewers see it. A plain path: the detail
 * screens belong to the viewer area and are typed once they exist.
 */
export const occasionPagePath = (occasionId: string): string =>
  `/events/${encodeURIComponent(occasionId)}`;

/** DT-03, a region's page as viewers see it (see `occasionPagePath`). */
export const regionPagePath = (regionId: string): string =>
  `/regions/${encodeURIComponent(regionId)}`;

/** CM-02 of an event. */
export const occasionMembersPath = (occasionId: string): string =>
  `/manage/events/${encodeURIComponent(occasionId)}/members`;

/** EM-01 of an event, a plain path for frames drawn outside the EM routes. */
export const occasionHomePath = (occasionId: string): string =>
  `/manage/events/${encodeURIComponent(occasionId)}`;

/** The frame of the EM screens (brand band labelled イベントの運営). */
export function EventShell({
  homeTo,
  children,
}: {
  /** EM-01 of the event, or MY-01 when no event is at hand. */
  homeTo: string;
  children: ReactNode;
}) {
  return (
    <ManageShell context="イベントの運営" homeTo={homeTo}>
      {children}
    </ManageShell>
  );
}

/**
 * イベント運営の管理ナビゲーション (参加店舗と申請 / イベント情報 / 開催地域 /
 * メンバー). While an operator stands in for an absent event operator
 * (CS-14) the nav says so and leads back to OM-02, and メンバー — opened
 * from OM-03, not by proxy — is left out.
 */
export function EventNav({
  occasionId,
  proxy,
  current,
}: {
  occasionId: string;
  proxy: boolean;
  /** Marks 参加店舗と申請 as current on CM-04, which is not under its URL. */
  current?: "participants";
}) {
  const params = { occasionId };
  return (
    <ManageNav
      label="イベントの運営"
      {...(proxy
        ? {
            proxy: (
              <ProxyBanner label="不在の代行中">
                <ProxyReturnLink placeId={occasionId} />
              </ProxyBanner>
            ),
          }
        : {})}
      links={
        <>
          <TextLink to={occasionPagePath(occasionId)}>
            閲覧者に見えるイベントページ
          </TextLink>
          <TextLink to="/me">マイページ</TextLink>
        </>
      }
    >
      <ManageNavItem
        to="/manage/events/$occasionId"
        params={params}
        activeOptions={{ exact: true }}
        activeProps={{ "aria-current": "page" }}
        {...(current === "participants" ? { "aria-current": "page" } : {})}
      >
        参加店舗と申請
      </ManageNavItem>
      <ManageNavItem
        to="/manage/events/$occasionId/info"
        params={params}
        activeProps={{ "aria-current": "page" }}
      >
        イベント情報
      </ManageNavItem>
      <ManageNavItem
        to="/manage/events/$occasionId/regions"
        params={params}
        activeProps={{ "aria-current": "page" }}
      >
        開催地域
      </ManageNavItem>
      {proxy ? null : (
        <ManageNavItem
          to={occasionMembersPath(occasionId)}
          activeProps={{ "aria-current": "page" }}
        >
          メンバー
        </ManageNavItem>
      )}
    </ManageNav>
  );
}

/** The managed event in the title band (a single target: no switcher). */
export function EventTarget({ frame }: { frame: OccasionFrame }) {
  return (
    <StaticTarget
      name={occasionName(frame.name)}
      status={occasionFrameStateText(frame)}
    />
  );
}

type EventPageProps = {
  frame: OccasionFrame;
  heading: string;
  /** A back entry above the target (CM-04: 参加店舗と申請へ戻る). */
  back?: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
  actionsNote?: ReactNode;
  current?: "participants";
};

/** One EM screen: the event in the title band, the body, the dock and the event nav. */
export function EventPage({
  frame,
  heading,
  back,
  children,
  actions,
  actionsNote,
  current,
}: EventPageProps) {
  return (
    <ManagePage
      title={
        <ManageTitle>
          {back}
          <EventTarget frame={frame} />
          <ManageHeading>{heading}</ManageHeading>
        </ManageTitle>
      }
      nav={
        <EventNav
          occasionId={frame.occasionId}
          proxy={frame.basis === "proxy"}
          {...(current === undefined ? {} : { current })}
        />
      }
      {...(actions === undefined ? {} : { actions })}
      {...(actionsNote === undefined ? {} : { actionsNote })}
    >
      {children}
    </ManagePage>
  );
}
