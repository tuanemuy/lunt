"use client";

import type { StewardedKind } from "@repo/core/domain/common/refs";
import { type ReactNode, type Usable, useCallback, useState } from "react";
import { RouteErrorContent } from "@/components/feedback/RouteErrorView";
import {
  ManageBody,
  ManageHeading,
  ManagePage,
  ManageShell,
  ManageTitle,
  StaticTarget,
} from "@/components/layout/ManageShell";
import { ShopNav, ShopTarget } from "@/components/manage/ShopShell";
import { OPS_HOME, OpsNav } from "@/components/ops/OpsShell";
import {
  ReportReturnLink,
  useReportReturn,
} from "@/components/ops/ProxyReturn";
import { ButtonLink } from "@/components/ui/Button";
import { Deferred } from "@/components/ui/Deferred";
import { EmptyPanel } from "@/components/ui/EmptyPanel";
import { TextLink } from "@/components/ui/TextButton";
import { classifyError } from "@/presentation/errorState";
import { MEMBER_WORDS, type MembersFrame } from "@/presentation/members";
import { MembersEndingContext } from "../MembersEnding";
import { MembersSkeleton } from "../MembersSkeleton";

const HEADING = "メンバーの管理";

/** OM-03 of the target: where an operator came from. A plain path (UI-A's OM screens). */
const subjectPath = (kind: StewardedKind, id: string): string =>
  `/ops/subjects/${kind}/${encodeURIComponent(id)}`;

/** The management home of a target (SM-01 / RM-01 / EM-01), a plain path. */
const homePath = (kind: StewardedKind, id: string): string =>
  `/manage/${kind === "place" ? "places" : kind === "region" ? "regions" : "events"}/${encodeURIComponent(id)}`;

/**
 * CM-02's frame, decided by the viewer's standing
 * (`spec/pages/index.md` 「読みもの編集とサービス運営のナビゲーション」): a
 * store's steward sees the store's title band and nav; any other operator
 * the service-operation nav with the way back to OM-03 — or to OM-05 when
 * the report being handled there opened this store's CM-02. The lists stream
 * in below (`board`).
 */
export function MembersScreen({
  frame,
  board,
}: {
  frame: MembersFrame;
  /** The RSC payload of `MemberBoardContent`, unresolved. */
  board: Usable<ReactNode>;
}) {
  const [ended, setEnded] = useState(false);
  const endMembership = useCallback(() => setEnded(true), []);
  const reportId = useReportReturn(frame.kind === "place" ? frame.id : null);
  const layout = frameLayout(frame, ended, reportId);
  // One tree for every standing: only props change, so the streamed board
  // (and its state, e.g. 辞任済み) stays mounted when the frame changes.
  return (
    <ManageShell
      context={layout.context}
      homeTo={layout.homeTo}
      solo={layout.nav === null}
    >
      <ManagePage
        title={
          <ManageTitle>
            {layout.back}
            {layout.target}
            <ManageHeading>{HEADING}</ManageHeading>
          </ManageTitle>
        }
        {...(layout.nav === null ? {} : { nav: layout.nav })}
      >
        <MembersEndingContext value={endMembership}>
          <Deferred promise={board} fallback={<MembersSkeleton />} />
        </MembersEndingContext>
      </ManagePage>
    </ManageShell>
  );
}

type FrameLayout = Readonly<{
  context: string;
  homeTo: string;
  back: ReactNode;
  target: ReactNode;
  nav: ReactNode | null;
}>;

function frameLayout(
  frame: MembersFrame,
  ended: boolean,
  /** The report whose OM-05 opened this store's CM-02, if any. */
  reportId: string | null,
): FrameLayout {
  const words = MEMBER_WORDS[frame.kind];
  if (ended) {
    // No longer a manager: no way back into the target's management.
    return {
      context: words.area,
      homeTo: "/me",
      back: null,
      target: null,
      nav: null,
    };
  }
  if (frame.shop !== null) {
    return {
      context: words.area,
      homeTo: homePath(frame.kind, frame.id),
      back: null,
      target: <ShopTarget frame={frame.shop} />,
      nav: <ShopNav frame={frame.shop} />,
    };
  }
  if (frame.steward) {
    // A region's / event's manager: their areas' navs arrive with S3A.
    return {
      context: words.area,
      homeTo: homePath(frame.kind, frame.id),
      back: null,
      target: <StaticTarget name={frame.name} status={frame.state} />,
      nav: null,
    };
  }
  return {
    context: "サービス運営",
    homeTo: OPS_HOME,
    back:
      reportId === null ? (
        <TextLink to={subjectPath(frame.kind, frame.id)} className="cm02-back">
          対象の運営へ戻る
        </TextLink>
      ) : (
        <ReportReturnLink reportId={reportId} className="cm02-back" />
      ),
    target: <StaticTarget name={frame.name} status={frame.state} />,
    nav: <OpsNav />,
  };
}

/**
 * CM-02's guard refused or failed, before any frame was known: CS-05 for
 * someone who neither manages the target nor operates the service, CS-17
 * for a target that does not exist, the common states otherwise.
 */
export function MembersProblem({
  kind,
  error,
}: {
  kind: StewardedKind;
  error: unknown;
}) {
  const words = MEMBER_WORDS[kind];
  const state = classifyError(error);
  return (
    <ManageShell context={words.area} homeTo="/me" solo>
      {state.kind === "forbidden" ? (
        <ManagePage title={null}>
          <ManageBody>
            <EmptyPanel
              title={`この${words.target}の${words.role}ではありません`}
              headingLevel="h1"
              actions={<ButtonLink to="/me">マイページへ戻る</ButtonLink>}
            >
              {`メンバーの管理は、その${words.target}の${words.role}と、サービス運営者だけが開けます。管理する店舗・地域・イベントは、マイページから開けます。`}
            </EmptyPanel>
          </ManageBody>
        </ManagePage>
      ) : state.kind === "notFound" ? (
        <ManagePage title={null}>
          <ManageBody>
            <EmptyPanel
              title={`${words.target}が見つかりません`}
              headingLevel="h1"
              actions={<ButtonLink to="/me">マイページへ戻る</ButtonLink>}
            >
              {`削除されたか、存在しない${words.target}です。マイページから、管理する対象を開き直してください。`}
            </EmptyPanel>
          </ManageBody>
        </ManagePage>
      ) : (
        <RouteErrorContent problem={{ kind: "error", error }} inManageShell />
      )}
    </ManageShell>
  );
}
