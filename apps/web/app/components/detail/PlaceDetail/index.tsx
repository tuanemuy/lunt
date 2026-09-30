"use client";

import {
  SaveButton,
  SaveFailureNotice,
  useSaveToggle,
} from "@/components/bookmark/SaveToggle";
import { ButtonLink } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { StatusTag, StatusTags } from "@/components/ui/StatusTag";
import { TextLink } from "@/components/ui/TextButton";
import { membershipApplyHref } from "@/presentation/applyRelationsView";
import { infoReportPath, takedownPath } from "@/presentation/applyView";
import type { PlaceDetailPage } from "@/presentation/detail";
import type { PlaceDetailData } from "@/presentation/detailView";
import { OPERATING_STATUS_TEXT } from "@/presentation/placeView";
import type { SaveState } from "@/presentation/savedView";
import { DetailPhotos } from "../DetailPhotos";
import { OccasionRows, RegionRows } from "../RelatedRows";
import { PlaceListings } from "./PlaceListings";

/** SM-01 of the store, a plain path (the SM screens belong to another area). */
const shopHomePath = (placeId: string): string =>
  `/manage/places/${encodeURIComponent(placeId)}`;

function OperatingNotice({ data }: { data: PlaceDetailData }) {
  const [displayed] = data.regions;
  switch (data.operating) {
    case "open":
      return null;
    case "temporarilyClosed":
      return (
        <Notice title="このお店は休業中です">
          営業の再開は、お店のことに載る営業状況でご確認ください。
        </Notice>
      );
    case "permanentlyClosed":
      return (
        <Notice
          title="このお店は閉店しました"
          {...(displayed === undefined
            ? {}
            : {
                actions: (
                  <TextLink
                    to="/regions/$regionId"
                    params={{ regionId: displayed.regionId }}
                  >
                    {`${displayed.name}のお店を見る`}
                  </TextLink>
                ),
              })}
        >
          {displayed === undefined
            ? "お店の情報と地図は、このまま見られます。"
            : "お店の情報と地図は、このまま見られます。同じ街のほかのお店も探せます。"}
        </Notice>
      );
  }
}

/**
 * The place's position in the screen (MapCanvas 32:2 + MapPin, reference
 * scene). The interactive map (MapLibre, D-13) arrives with the map
 * screens of stage 4; until then a still canvas with the pin stands in.
 */
function PlaceMap({ data }: { data: PlaceDetailData }) {
  const { latitude, longitude } = data.location;
  return (
    <div
      className="map dt02-map"
      id="map"
      role="img"
      aria-label={`${data.name}の位置の地図（北緯${latitude.toFixed(5)}、東経${longitude.toFixed(5)}）`}
    >
      <span className="map-pin" aria-hidden="true">
        店
      </span>
    </div>
  );
}

/**
 * 「詳細の手続きの入口」 of DT-02 (`spec/pages/index.md`): the management
 * (SM-01) for its steward, otherwise 「このお店を管理する」 (RQ-03); the
 * applications of a place without a steward (RQ-02, RQ-04) or the report
 * for one with a steward (RQ-08) — the affiliation and leave application
 * (RQ-05) among the former; the takedown claim (RQ-07) always. The save
 * toggle (CF-04) sits on the hero photo.
 */
function PlaceProcedures({ data }: { data: PlaceDetailData }) {
  const { placeId } = data;
  return (
    <div className="procedures">
      <hr className="divider" />
      {data.viewerIsSteward ? (
        <ButtonLink variant="secondary" to={shopHomePath(placeId)}>
          お店の管理へ
        </ButtonLink>
      ) : (
        <ButtonLink
          variant="secondary"
          to="/apply/places/$placeId/stewardship"
          params={{ placeId }}
        >
          このお店を管理する
        </ButtonLink>
      )}
      <div className="procedures__links">
        {data.placeIsVacant ? (
          <>
            <TextLink
              quiet
              to="/apply/places/$placeId/revision"
              params={{ placeId }}
            >
              お店の情報の修正を申請する
            </TextLink>
            <TextLink
              quiet
              to="/apply/places/$placeId/listings/new"
              params={{ placeId }}
            >
              掲載を申請する
            </TextLink>
            <TextLink quiet to={membershipApplyHref({ placeId })}>
              街への所属・離脱を申請する
            </TextLink>
          </>
        ) : (
          <TextLink quiet to={infoReportPath("place", placeId)}>
            情報の誤り・閉店を連絡する
          </TextLink>
        )}
        <TextLink quiet to={takedownPath("place", placeId)}>
          このお店の取り下げを申し立てる
        </TextLink>
      </div>
    </div>
  );
}

/**
 * DT-02 店舗詳細 (`spec/pages/detail.md`): the place in the reference scene
 * with its operating status and displayed region, its listings (CF-05),
 * its position, all its viewable regions (DT-03, the displayed one first)
 * and the upcoming and ongoing occasions it takes part in (DT-04,
 * discovery scene). A section with nothing to show is left out; articles
 * have none before their stage. The procedures close it
 * (`PlaceProcedures`).
 */
export function PlaceDetail({
  page,
  saveState,
}: {
  page: PlaceDetailPage;
  saveState: SaveState;
}) {
  const { place: data, listings } = page;
  const [displayed] = data.regions;
  const save = useSaveToggle({
    target: { kind: "place", id: data.placeId },
    saveState,
  });
  const saveButton = <SaveButton state={save} label="このお店を保存" />;
  const hasPhotos = data.photos.length > 0;
  return (
    <div className="container detail-page">
      <div className="detail detail--split">
        <DetailPhotos photos={data.photos} overlay={saveButton} />
        <div className="detail__main">
          <div className="hero__text">
            {hasPhotos ? (
              <h1 className="hero__name">{data.name}</h1>
            ) : (
              <div className="hero__title-row">
                <h1 className="hero__name">{data.name}</h1>
                {saveButton}
              </div>
            )}
            {displayed === undefined ? null : (
              <p className="hero__place">{displayed.name}</p>
            )}
            {data.operating === "open" ? null : (
              <StatusTags>
                <StatusTag quiet>
                  {data.operating === "temporarilyClosed" ? "休業中" : "閉店"}
                </StatusTag>
              </StatusTags>
            )}
            {data.description === null ? null : (
              <p className="hero__description">{data.description}</p>
            )}
          </div>

          <SaveFailureNotice state={save} />

          <OperatingNotice data={data} />

          <a className="button button--primary" href="#map">
            地図で見る
          </a>

          <PlaceListings
            key={data.placeId}
            placeId={data.placeId}
            first={listings}
          />

          <section className="detail-section" aria-labelledby="dt02-about">
            <SectionTitle id="dt02-about">お店のこと</SectionTitle>
            <dl className="detail-text dt02-facts">
              <div>
                <dt>所在地</dt>
                <dd>{data.address}</dd>
              </div>
              {data.businessHours === null ? null : (
                <div>
                  <dt>営業時間</dt>
                  <dd>{data.businessHours}</dd>
                </div>
              )}
              {data.contact === null ? null : (
                <div>
                  <dt>連絡先</dt>
                  <dd>{data.contact}</dd>
                </div>
              )}
              <div>
                <dt>営業状況</dt>
                <dd>{OPERATING_STATUS_TEXT[data.operating]}</dd>
              </div>
            </dl>
            <PlaceMap data={data} />
          </section>

          {data.regions.length === 0 ? null : (
            <section aria-label="所属する街">
              <RegionRows items={data.regions} />
            </section>
          )}

          {data.occasions.length === 0 ? null : (
            <section className="detail-section" aria-labelledby="dt02-events">
              <SectionTitle id="dt02-events">参加しているイベント</SectionTitle>
              <OccasionRows items={data.occasions} />
            </section>
          )}

          <PlaceProcedures data={data} />
        </div>
      </div>
    </div>
  );
}
