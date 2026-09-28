import { ButtonLink } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { TextLink } from "@/components/ui/TextButton";
import { infoReportPath, takedownPath } from "@/presentation/applyView";
import {
  type ListingDetailData,
  listingHeroOf,
} from "@/presentation/detailView";
import { DetailPhotos } from "../DetailPhotos";
import { ListingCards } from "../ListingCard";
import { ListingHeroText } from "../ListingHero";

function PlaceNotice({ data }: { data: ListingDetailData }) {
  const { name, operating } = data.place;
  switch (operating) {
    case "open":
      return null;
    case "temporarilyClosed":
      return (
        <Notice title={`${name}は休業中です`}>
          再開の予定は、お店の情報でご確認ください。
        </Notice>
      );
    case "permanentlyClosed":
      return (
        <Notice title={`${name}は閉店しました`}>
          お店の情報と、同じ街のほかのお店をご覧ください。
        </Notice>
      );
  }
}

/**
 * 「詳細の手続きの入口」 of DT-01 (`spec/pages/index.md`): the revision
 * application (RQ-04) for a listing of a place without a steward, the
 * report (RQ-08) for one with a steward, and the takedown claim (RQ-07)
 * always. The save toggle (CF-04) joins with its stage.
 */
function ListingProcedures({ data }: { data: ListingDetailData }) {
  const { listingId } = data;
  return (
    <div className="procedures">
      <hr className="divider" />
      <div className="procedures__links">
        {data.placeIsVacant ? (
          <TextLink
            quiet
            to="/apply/listings/$listingId/revision"
            params={{ listingId }}
          >
            この掲載の修正を申請する
          </TextLink>
        ) : (
          <TextLink quiet to={infoReportPath("listing", listingId)}>
            情報の誤り・閉店を連絡する
          </TextLink>
        )}
        <TextLink quiet to={takedownPath("listing", listingId)}>
          この掲載の取り下げを申し立てる
        </TextLink>
      </div>
    </div>
  );
}

/**
 * DT-01 掲載詳細 (`spec/pages/detail.md`): the listing in the reference
 * scene with its offering and place states, the way to its place, and the
 * other listings (discovery scene). Regions, occasions and articles have
 * no entries before their stages, so their sections are not shown
 * (「対象が1件もない区分は、区分ごと表示しない」). The procedures close it
 * (`ListingProcedures`).
 */
export function ListingDetail({ data }: { data: ListingDetailData }) {
  const { offering, place } = data;
  const hasOthers = data.otherListings.length > 0;
  return (
    <div className="container detail-page">
      <div className="detail detail--split">
        <DetailPhotos photos={data.photos} />
        <div className="detail__main">
          <ListingHeroText hero={listingHeroOf(data)} />

          {offering.phase === "ended" ? (
            <Notice
              title="この掲載の提供は終了しました"
              actions={
                <>
                  <TextLink
                    to="/places/$placeId"
                    params={{ placeId: place.placeId }}
                  >
                    {`${place.name}を見る`}
                  </TextLink>
                  {hasOthers ? (
                    <a className="text-button" href="#others">
                      こちらも気になる
                    </a>
                  ) : null}
                </>
              }
            >
              お店のほかの掲載や、近くで見つかるものをご覧ください。
            </Notice>
          ) : null}
          <PlaceNotice data={data} />

          <ButtonLink to="/places/$placeId" params={{ placeId: place.placeId }}>
            お店を見る
          </ButtonLink>

          {hasOthers ? (
            <section
              className="detail-section"
              aria-labelledby="dt01-others"
              id="others"
            >
              <SectionTitle id="dt01-others">こちらも気になる</SectionTitle>
              <ListingCards items={data.otherListings} />
            </section>
          ) : null}

          <ListingProcedures data={data} />
        </div>
      </div>
    </div>
  );
}
