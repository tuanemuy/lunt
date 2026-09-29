"use client";

import { RegionErrorCode } from "@repo/core/domain/region/errorCode";
import { useLocation } from "@tanstack/react-router";
import { useOptimistic, useState, useTransition } from "react";
import { ManageBody, ManageSection } from "@/components/layout/ManageShell";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button, ButtonLink } from "@/components/ui/Button";
import { ChipButton } from "@/components/ui/ChipButton";
import { DonePanel } from "@/components/ui/DonePanel";
import { EmptyPanel } from "@/components/ui/EmptyPanel";
import { FocusOnMount } from "@/components/ui/FocusOnMount";
import { Row, RowLink } from "@/components/ui/Rows";
import { TextLink } from "@/components/ui/TextButton";
import { classifyError } from "@/presentation/errorState";
import { useReconcile } from "@/presentation/reconcile";
import {
  type AffiliatedRegionItem,
  type AffiliationStatusData,
  CONTENT_PUBLICATION_LABEL,
  chooseRepresentativeRegionFn,
  hiddenReason,
} from "@/presentation/shopRelations";
import { placePagePath, ShopPage } from "../ShopShell";
import { usePlaceFrame } from "../ShopShell/usePlaceFrame";

const HEADING = "所属地域の状況";

type Representative = AffiliationStatusData["representative"];

/** What the last choice came to; the screen's current state comes from props. */
type Outcome =
  | Readonly<{ kind: "chosen"; regionId: string }>
  | Readonly<{ kind: "notAffiliated"; name: string }>
  | Readonly<{ kind: "alreadyChosen"; name: string }>
  | Readonly<{ kind: "conflict" }>
  | Readonly<{ kind: "forbidden" }>
  | Readonly<{ kind: "loginRequired" }>
  | Readonly<{ kind: "failed" }>;

const nameOf = (region: AffiliatedRegionItem | undefined): string =>
  region?.name ?? "名称のない地域";

/**
 * 「代わりに表示されている所属地域」: when viewers cannot see the
 * representative, which region they are shown instead.
 */
function substituteSentence(
  representative: AffiliatedRegionItem,
  displayed: AffiliatedRegionItem | undefined,
): string | null {
  if (representative.viewable) return null;
  const reason =
    hiddenReason(representative.publication, representative.suspended) ??
    "閲覧者に表示されていないため";
  return displayed === undefined
    ? `${nameOf(representative)}は${reason}、閲覧者には、一覧で店舗と掲載に地域名を示していません。`
    : `${nameOf(representative)}は${reason}、閲覧者には、代わりに${nameOf(displayed)}を示しています。`;
}

/** 代表地域: which region it is, and how it came to be. */
function RepresentativeSection({
  regions,
  representative,
  displayedRegionId,
}: {
  regions: readonly AffiliatedRegionItem[];
  representative: NonNullable<Representative>;
  displayedRegionId: string | null;
}) {
  const current = regions.find(
    (region) => region.regionId === representative.regionId,
  );
  if (current === undefined) return null;
  const displayed = regions.find(
    (region) => region.regionId === displayedRegionId,
  );
  const substitute = substituteSentence(current, displayed);
  const name = nameOf(current);
  const [title, help] =
    regions.length === 1
      ? [
          name,
          "所属している地域が1つのため、この地域が代表地域です。一覧で店舗と掲載に示す地域名になります。",
        ]
      : representative.chosen
        ? [`${name}（選んだ代表地域）`, "一覧で店舗と掲載に示す地域名です。"]
        : [
            `${name}（最初に所属した地域）`,
            `選んだ代表地域がないため、最初に所属した${name}が代表地域になっています。所属中の地域から選べます。`,
          ];
  return (
    <ManageSection id="sm05-rep" title="代表地域">
      <div className="sm05-rep">
        <p className="sm05-rep__name">{title}</p>
        <p className="m-field__help">
          {substitute === null ? help : `${help}${substitute}`}
        </p>
      </div>
    </ManageSection>
  );
}

function RegionBadges({
  region,
  representative,
  isDisplayedSubstitute,
}: {
  region: AffiliatedRegionItem;
  representative: Representative;
  isDisplayedSubstitute: boolean;
}) {
  const isRepresentative = representative?.regionId === region.regionId;
  return (
    <span className="p-badges">
      {isRepresentative ? (
        <Badge tone="accent">
          {representative?.chosen ? "代表地域（選択済み）" : "代表地域"}
        </Badge>
      ) : null}
      {region.suspended ? <Badge tone="alert">運営による非公開</Badge> : null}
      <Badge tone={region.publication === "unpublished" ? "muted" : "neutral"}>
        {CONTENT_PUBLICATION_LABEL[region.publication]}
      </Badge>
      {isDisplayedSubstitute ? (
        <Badge>閲覧者には代わりにこの地域を表示</Badge>
      ) : null}
    </span>
  );
}

function RegionItem({
  region,
  representative,
  displayedRegionId,
  choosable,
  choosing,
  onChoose,
}: {
  region: AffiliatedRegionItem;
  representative: Representative;
  displayedRegionId: string | null;
  /** More than one affiliation: the representative can be chosen. */
  choosable: boolean;
  choosing: boolean;
  onChoose: (region: AffiliatedRegionItem) => void;
}) {
  const isRepresentative = representative?.regionId === region.regionId;
  const isDisplayedSubstitute =
    displayedRegionId === region.regionId &&
    representative !== null &&
    representative.regionId !== region.regionId;
  const row = {
    photo: null,
    name: nameOf(region),
    meta: `${region.since}から所属`,
    sub: (
      <RegionBadges
        region={region}
        representative={representative}
        isDisplayedSubstitute={isDisplayedSubstitute}
      />
    ),
  };
  const hidden = hiddenReason(region.publication, region.suspended);
  return (
    <li className="p-item">
      {region.viewable ? (
        <RowLink
          to="/regions/$regionId"
          params={{ regionId: region.regionId }}
          {...row}
        />
      ) : (
        <Row {...row} />
      )}
      {region.viewable ? null : (
        <p className="p-item__text">
          {`${hidden ?? "閲覧者に表示されていないため"}、閲覧者には所属地域として表示されていません。`}
        </p>
      )}
      {choosable ? (
        <div className="p-item__ops">
          {isRepresentative ? (
            <ChipButton disabled>代表地域です</ChipButton>
          ) : (
            <ChipButton
              disabled={choosing}
              onClick={() => onChoose(region)}
              aria-label={`${nameOf(region)}を代表地域にする`}
            >
              代表地域にする
            </ChipButton>
          )}
        </div>
      ) : null}
    </li>
  );
}

function OutcomeAlert({ outcome }: { outcome: Outcome }) {
  const here = useLocation({ select: (location) => location.href });
  switch (outcome.kind) {
    case "chosen":
      return null;
    case "notAffiliated":
      return (
        <Alert title={`${outcome.name}を代表地域にできませんでした`}>
          {`${outcome.name}との所属は、すでに解除されていました。代表地域は変えていません。最新の所属と代表地域を示しています。`}
        </Alert>
      );
    case "alreadyChosen":
      return (
        <Alert title={`${outcome.name}は、すでに代表地域です`}>
          {`別の画面で、先に${outcome.name}が代表地域に選ばれていました。何も変えていません。`}
        </Alert>
      );
    case "conflict":
      return (
        <Alert title="代表地域を変えられませんでした">
          ほかの操作と重なりました。最新の所属と代表地域を読み直しました。もう一度選んでください。
        </Alert>
      );
    case "forbidden":
      return (
        <Alert
          title="この店舗を管理する権限がありません"
          actions={<ButtonLink to="/me">マイページへ戻る</ButtonLink>}
        >
          店舗の管理権限がなくなりました。代表地域は変えていません。
        </Alert>
      );
    case "loginRequired":
      return (
        <Alert
          title="ログインが必要です"
          actions={
            <ButtonLink to="/login" search={{ next: here }}>
              ログインする
            </ButtonLink>
          }
        >
          ログインの有効期限が切れました。代表地域は変えていません。
        </Alert>
      );
    case "failed":
      return (
        <Alert title="代表地域を変えられませんでした">
          通信を確かめて、もう一度お試しください。代表地域は変わっていません。
        </Alert>
      );
  }
}

/**
 * SM-05 所属地域の状況 (`spec/pages/shop.md`): the store's representative
 * region and the regions it belongs to — hidden ones (unpublished,
 * suspended) with their state and the fact that viewers do not see them.
 * With two or more, a region is made the representative in place
 * (`chooseRepresentativeRegion`, no approval): the choice shows at once
 * (`useOptimistic`), then the screen confirms it (CS-13); a region whose
 * affiliation ended or that already is the representative answers CS-08
 * with the latest state. The pending applications and the entries to
 * RQ-05 (所属・離脱の申請) arrive with stage 3b; MY-04 lists the store's
 * applications meanwhile.
 */
export function AffiliationStatusView({
  data,
}: {
  data: AffiliationStatusData;
}) {
  const frame = usePlaceFrame();
  const reconcile = useReconcile();
  const [choosing, startChoose] = useTransition();
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [representative, chooseOptimistic] = useOptimistic<
    Representative,
    string
  >(data.representative, (_current, regionId) => ({
    regionId,
    chosen: true,
  }));
  const { regions } = data;

  const choose = (region: AffiliatedRegionItem) => {
    const name = nameOf(region);
    setOutcome(null);
    startChoose(async () => {
      chooseOptimistic(region.regionId);
      try {
        await chooseRepresentativeRegionFn({
          data: { placeId: frame.placeId, regionId: region.regionId },
        });
        setOutcome({ kind: "chosen", regionId: region.regionId });
        await reconcile();
      } catch (error) {
        const failure = classifyError(error);
        const refused: Outcome =
          failure.code === RegionErrorCode.NotAffiliated
            ? { kind: "notAffiliated", name }
            : failure.code === RegionErrorCode.RepresentativeAlreadyChosen
              ? { kind: "alreadyChosen", name }
              : failure.kind === "conflict"
                ? { kind: "conflict" }
                : failure.kind === "forbidden"
                  ? { kind: "forbidden" }
                  : failure.kind === "loginRequired"
                    ? { kind: "loginRequired" }
                    : { kind: "failed" };
        setOutcome(refused);
        // The latest state is read again only when the refusal says it
        // changed; a lost session or access would re-run the area's guard,
        // and a failed request leaves nothing changed to read.
        if (
          refused.kind === "notAffiliated" ||
          refused.kind === "alreadyChosen" ||
          refused.kind === "conflict"
        ) {
          await reconcile();
        }
      }
    });
  };

  if (outcome?.kind === "chosen" && !choosing) {
    const chosen = regions.find(
      (region) => region.regionId === outcome.regionId,
    );
    const displayed = regions.find(
      (region) => region.regionId === data.displayedRegionId,
    );
    const name = nameOf(chosen);
    const substitute =
      chosen === undefined || chosen.viewable
        ? null
        : displayed === undefined
          ? `${name}が閲覧者に表示されていない間は、一覧に地域名を示しません。`
          : `${name}が閲覧者に表示されていない間は、閲覧者には代わりに${nameOf(displayed)}を示します。`;
    return (
      <ShopPage frame={frame} heading={HEADING}>
        <ManageBody>
          <FocusOnMount>
            <DonePanel
              title={`代表地域を${name}にしました`}
              actions={
                <>
                  <Button onClick={() => setOutcome(null)}>
                    所属地域の状況に戻る
                  </Button>
                  <ButtonLink
                    variant="secondary"
                    to={placePagePath(frame.placeId)}
                  >
                    店舗ページを見る
                  </ButtonLink>
                </>
              }
            >
              {`一覧で店舗と掲載に示す地域名が、${name}になりました。${substitute ?? ""}`}
            </DonePanel>
          </FocusOnMount>
        </ManageBody>
      </ShopPage>
    );
  }

  return (
    <ShopPage frame={frame} heading={HEADING}>
      <ManageBody>
        {outcome === null ? null : <OutcomeAlert outcome={outcome} />}
        {regions.length === 0 ? (
          <EmptyPanel title="所属している地域はありません">
            地域に所属すると、店舗と掲載が地域の一覧に表示されます。所属は、地域の運営者の承認で決まります。
          </EmptyPanel>
        ) : (
          <>
            {representative === null ? null : (
              <RepresentativeSection
                regions={regions}
                representative={representative}
                displayedRegionId={data.displayedRegionId}
              />
            )}
            <ManageSection id="sm05-member" title="所属中の地域">
              <ul className="p-items">
                {regions.map((region) => (
                  <RegionItem
                    key={region.regionId}
                    region={region}
                    representative={representative}
                    displayedRegionId={data.displayedRegionId}
                    choosable={regions.length > 1}
                    choosing={choosing}
                    onChoose={choose}
                  />
                ))}
              </ul>
              {regions.length > 1 ? (
                <p className="m-field__help">
                  代表地域は、承認なしで、選んだ時点で変わります。公開を取り下げた地域と、運営による非公開の地域も選べます。
                </p>
              ) : null}
            </ManageSection>
          </>
        )}
        <TextLink to="/me/applications" search={{ place: frame.placeId }}>
          この店舗の申請をすべて見る
        </TextLink>
      </ManageBody>
    </ShopPage>
  );
}
