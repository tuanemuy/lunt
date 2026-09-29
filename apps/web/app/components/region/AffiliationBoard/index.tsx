"use client";

import { useRouter } from "@tanstack/react-router";
import {
  useCallback,
  useOptimistic,
  useRef,
  useState,
  useTransition,
} from "react";
import { ManageBody } from "@/components/layout/ManageShell";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button, ButtonLink } from "@/components/ui/Button";
import { ChipButton } from "@/components/ui/ChipButton";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DonePanel } from "@/components/ui/DonePanel";
import { EmptyPanel } from "@/components/ui/EmptyPanel";
import { FocusOnMount } from "@/components/ui/FocusOnMount";
import { LinkList, ListRowLink, Row, RowLink } from "@/components/ui/Rows";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { classifyError, type ErrorState } from "@/presentation/errorState";
import { OPERATING_STATUS_LABEL } from "@/presentation/placeView";
import { useReconcile } from "@/presentation/reconcile";
import {
  excludeAffiliatedPlaceFn,
  listAffiliatedPlacesFn,
  listRegionApplicationsFn,
} from "@/presentation/region";
import {
  type AffiliatedPlaceItem,
  type AffiliationsData,
  placeDetailPath,
  REGION_LIST_PAGE_SIZE,
  type RegionApplicationItem,
  regionNameText,
} from "@/presentation/regionView";
import { ListFooter } from "../ListFooter";
import { RegionPage } from "../RegionShell";
import { useRegionFrame } from "../RegionShell/useRegionFrame";
import { usePagedList } from "../usePagedList";

const HEADING = "所属店舗と申請";

type Outcome =
  | Readonly<{ kind: "excluded"; name: string }>
  | Readonly<{ kind: "notAffiliated"; name: string }>
  | Readonly<{ kind: "failed"; error: ErrorState; place: AffiliatedPlaceItem }>
  | Readonly<{ kind: "lostProxy" }>
  | Readonly<{ kind: "lostAccess" }>;

const placeKey = (place: AffiliatedPlaceItem) => place.placeId;
const applicationKey = (item: RegionApplicationItem) => item.applicationId;

function ApplicationsSection({ data }: { data: AffiliationsData }) {
  const fetchPage = useCallback(
    (page: number) =>
      listRegionApplicationsFn({
        data: {
          regionId: data.regionId,
          page,
          limit: REGION_LIST_PAGE_SIZE,
        },
      }),
    [data.regionId],
  );
  const list = usePagedList(
    data.applications,
    REGION_LIST_PAGE_SIZE,
    applicationKey,
    fetchPage,
  );
  const { underReview } = data.applications;
  return (
    <section className="m-section" aria-labelledby="rm01-applications">
      <div className="om-count">
        <SectionTitle variant="manage" id="rm01-applications">
          所属・離脱の申請
        </SectionTitle>
        {underReview > 0 ? (
          <Badge tone="accent">{`確認中 ${underReview}件`}</Badge>
        ) : null}
      </div>
      {list.items.length === 0 ? (
        <p className="m-field__help">
          申請はありません。店舗から所属・離脱の申請が届くと、ここに並びます。
        </p>
      ) : (
        <>
          <LinkList>
            {list.items.map((item) => (
              <li key={item.applicationId}>
                <ListRowLink
                  to="/manage/applications/$applicationId"
                  params={{ applicationId: item.applicationId }}
                  title={item.title}
                  meta={item.meta}
                  end={<Badge tone={item.tone}>{item.statusLabel}</Badge>}
                />
              </li>
            ))}
          </LinkList>
          <p className="m-field__help">
            確認中の申請を選ぶと、申請の判断へ進みます。
          </p>
          <ListFooter {...list} endText="すべての申請を表示しました" />
        </>
      )}
    </section>
  );
}

function PlaceBadges({ place }: { place: AffiliatedPlaceItem }) {
  return (
    <span className="p-badges">
      <Badge tone={place.operatingStatus === "open" ? "accent" : "muted"}>
        {OPERATING_STATUS_LABEL[place.operatingStatus]}
      </Badge>
      {place.suspended ? <Badge tone="alert">店舗は非公開</Badge> : null}
    </span>
  );
}

/**
 * RM-01 所属店舗と申請 (REG-08, REG-10): the affiliation / leave
 * applications, each opening CM-01, and the affiliated places, each
 * excluded after CS-12. The board owns the places: an exclusion removes the
 * row at once and the reconcile brings the stored list.
 */
export function AffiliationBoard({ data }: { data: AffiliationsData }) {
  const frame = useRegionFrame();
  const router = useRouter();
  const reconcile = useReconcile();
  const proxy = frame.basis === "proxy";
  const regionName = regionNameText(frame.name);
  const fetchPage = useCallback(
    (page: number) =>
      listAffiliatedPlacesFn({
        data: {
          regionId: data.regionId,
          page,
          limit: REGION_LIST_PAGE_SIZE,
        },
      }),
    [data.regionId],
  );
  const list = usePagedList(
    data.places,
    REGION_LIST_PAGE_SIZE,
    placeKey,
    fetchPage,
  );
  // Rows gone from the stored list; a later page loaded before the
  // exclusion may still hold them.
  const [gone, setGone] = useState<ReadonlySet<string>>(new Set());
  const fresh = new Set(data.places.items.map(placeKey));
  const stored = list.items.filter(
    (place) => fresh.has(place.placeId) || !gone.has(place.placeId),
  );
  const [places, removePlace] = useOptimistic(
    stored,
    (current, placeId: string) =>
      current.filter((place) => place.placeId !== placeId),
  );
  const [confirming, setConfirming] = useState<AffiliatedPlaceItem | null>(
    null,
  );
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [excluding, startExclude] = useTransition();
  const sectionRef = useRef<HTMLElement>(null);
  const removed = stored.length - places.length;
  const count = Math.max(0, data.places.count - removed);

  const exclude = (place: AffiliatedPlaceItem) => {
    setConfirming(null);
    setOutcome(null);
    startExclude(async () => {
      removePlace(place.placeId);
      sectionRef.current?.focus();
      const markGone = () =>
        setGone((current) => new Set([...current, place.placeId]));
      try {
        await excludeAffiliatedPlaceFn({
          data: { regionId: data.regionId, placeId: place.placeId },
        });
        markGone();
        setOutcome({ kind: "excluded", name: place.name });
        await reconcile();
      } catch (error) {
        const state = classifyError(error);
        if (state.kind === "premiseChanged") {
          markGone();
          setOutcome({ kind: "notAffiliated", name: place.name });
          await reconcile();
        } else if (state.kind === "forbidden") {
          setOutcome(proxy ? { kind: "lostProxy" } : { kind: "lostAccess" });
          if (!proxy) router.clearCache();
        } else {
          setOutcome({ kind: "failed", error: state, place });
        }
      }
    });
  };

  if (outcome?.kind === "lostAccess") {
    return (
      <RegionPage frame={frame} heading={HEADING}>
        <ManageBody>
          <FocusOnMount role="alert">
            <EmptyPanel
              title="この地域の地域運営者ではありません"
              actions={<ButtonLink to="/me">マイページへ戻る</ButtonLink>}
            >
              地域の管理権限がなくなったため、除外は反映していません。
            </EmptyPanel>
          </FocusOnMount>
        </ManageBody>
      </RegionPage>
    );
  }

  if (outcome?.kind === "excluded") {
    return (
      <RegionPage frame={frame} heading={HEADING}>
        <FocusOnMount>
          <DonePanel
            title={`${outcome.name}を除外しました`}
            actions={
              <Button onClick={() => setOutcome(null)}>
                所属店舗と申請に戻る
              </Button>
            }
          >
            {`${outcome.name}は、${regionName}の所属店舗から外れました。店舗と掲載の公開状態・提供状態と、他の地域への所属は変わっていません。`}
          </DonePanel>
        </FocusOnMount>
      </RegionPage>
    );
  }

  return (
    <RegionPage frame={frame} heading={HEADING}>
      <ManageBody>
        {outcome?.kind === "notAffiliated" ? (
          <Alert title={`${outcome.name}は除外できませんでした`}>
            {`${outcome.name}の所属は、離脱の承認または別の運営者の除外で、すでに解除されていました。最新の所属店舗を示しています。`}
          </Alert>
        ) : outcome?.kind === "lostProxy" ? (
          <Alert
            title="この地域は代行できません"
            actions={
              <ButtonLink
                variant="secondary"
                to="/ops/subjects/$kind/$id"
                params={{ kind: "region", id: frame.regionId }}
              >
                地域の運営へ戻る
              </ButtonLink>
            }
          >
            この地域には地域運営者が就きました。除外は反映していません。地域の運営の画面で、運営者がいることを確かめてください。
          </Alert>
        ) : outcome?.kind === "failed" ? (
          <Alert
            title={`${outcome.place.name}を除外できませんでした`}
            {...(outcome.error.kind === "failed"
              ? {
                  actions: (
                    <Button
                      variant="secondary"
                      disabled={excluding}
                      onClick={() => exclude(outcome.place)}
                    >
                      もう一度除外する
                    </Button>
                  ),
                }
              : {})}
          >
            {outcome.error.kind === "failed"
              ? "通信を確かめて、もう一度操作してください。所属は変わっていません。"
              : outcome.error.message}
          </Alert>
        ) : null}

        <ApplicationsSection data={data} />

        <section
          className="m-section outline-none"
          aria-labelledby="rm01-places"
          ref={sectionRef}
          tabIndex={-1}
        >
          <div className="om-count">
            <SectionTitle variant="manage" id="rm01-places">
              所属店舗
            </SectionTitle>
            {places.length === 0 ? null : <Badge>{`${count}店舗`}</Badge>}
          </div>
          {places.length === 0 ? (
            <p className="m-field__help">
              所属店舗はありません。店舗からの所属の申請を承認すると、ここに並びます。
            </p>
          ) : (
            <>
              <ul className="p-items" aria-busy={excluding}>
                {places.map((place) => (
                  <li className="p-item" key={place.placeId}>
                    {place.suspended ? (
                      <Row
                        photo={null}
                        name={place.name}
                        sub={<PlaceBadges place={place} />}
                      />
                    ) : (
                      <RowLink
                        to={placeDetailPath(place.placeId)}
                        photo={null}
                        name={place.name}
                        sub={<PlaceBadges place={place} />}
                      />
                    )}
                    {place.suspended ? (
                      <p className="p-item__text">
                        店舗は非公開のため、閲覧者には表示されていません。
                      </p>
                    ) : null}
                    <div className="p-item__ops">
                      <ChipButton
                        disabled={excluding}
                        onClick={() => setConfirming(place)}
                      >
                        除外する
                      </ChipButton>
                    </div>
                  </li>
                ))}
              </ul>
              <p className="m-field__help">
                除外は、理由を求めずに行えます。所属店舗の情報と掲載は、この画面では変えられません。
              </p>
              <ListFooter {...list} endText="すべての所属店舗を表示しました" />
            </>
          )}
        </section>
      </ManageBody>
      <ConfirmDialog
        open={confirming !== null}
        title={`${confirming?.name ?? ""}を除外しますか`}
        confirmLabel="除外する"
        pending={excluding}
        onConfirm={() => {
          if (confirming !== null) exclude(confirming);
        }}
        onCancel={() => setConfirming(null)}
      >
        <p>確定すると、次のようになります。</p>
        <ul>
          <li>{`${confirming?.name ?? ""}の所属が解除され、${regionName}の所属店舗から外れます`}</li>
          <li>店舗と掲載の公開状態・提供状態は変わりません</li>
          <li>他の地域への所属は変わりません</li>
          <li>
            除外は取り消せません。再び所属するには、店舗からの所属の申請が必要です
          </li>
        </ul>
      </ConfirmDialog>
    </RegionPage>
  );
}
