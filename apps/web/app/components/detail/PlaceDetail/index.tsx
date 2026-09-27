import { ButtonLink } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { StatusTag, StatusTags } from "@/components/ui/StatusTag";
import type { PlaceDetailPage } from "@/presentation/detail";
import {
  OPERATING_TEXT,
  type PlaceDetailData,
} from "@/presentation/detailView";
import { DetailPhotos } from "../DetailPhotos";
import { PlaceListings } from "./PlaceListings";

/** SM-01 of the store, a plain path (the SM screens belong to another area). */
const shopHomePath = (placeId: string): string =>
  `/manage/places/${encodeURIComponent(placeId)}`;

function OperatingNotice({ data }: { data: PlaceDetailData }) {
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
        <Notice title="このお店は閉店しました">
          お店の情報と地図は、このまま見られます。
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
 * DT-02 店舗詳細 (`spec/pages/detail.md`): the place in the reference scene
 * with its operating status, its listings (CF-05) and its position. The
 * regions, occasions and articles sections have no entries before their
 * stages and are not shown. A steward of the place gets the way to its
 * management (SM-01); the other procedure entries (RQ-02〜RQ-05, RQ-07,
 * RQ-08) and the save toggle (CF-04) join with their stages.
 */
export function PlaceDetail({ page }: { page: PlaceDetailPage }) {
  const { place: data, listings } = page;
  return (
    <div className="container detail-page">
      <div className="detail detail--split">
        <DetailPhotos photos={data.photos} />
        <div className="detail__main">
          <div className="hero__text">
            <h1 className="hero__name">{data.name}</h1>
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
                <dd>{OPERATING_TEXT[data.operating]}</dd>
              </div>
            </dl>
            <PlaceMap data={data} />
          </section>

          {data.viewerIsSteward ? (
            <div className="procedures">
              <hr className="divider" />
              <ButtonLink variant="secondary" to={shopHomePath(data.placeId)}>
                お店の管理へ
              </ButtonLink>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
