import { ButtonLink } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { TextLink } from "@/components/ui/TextButton";
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
 * DT-01 掲載詳細 (`spec/pages/detail.md`): the listing in the reference
 * scene with its offering and place states, the way to its place, and the
 * other listings (discovery scene). Regions, occasions and articles have
 * no entries before their stages, so their sections are not shown
 * (「対象が1件もない区分は、区分ごと表示しない」). The save toggle (CF-04) and
 * the procedure entries (RQ-04 / RQ-07 / RQ-08) join with their stages.
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
        </div>
      </div>
    </div>
  );
}
