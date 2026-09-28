import { StatusTag, StatusTags } from "@/components/ui/StatusTag";
import type { ListingHeroData } from "@/presentation/detailView";

/**
 * DetailHero's text of a listing (DT-01): category, name, place, the
 * offering and operating states, the offering line and the description.
 * CM-03 renders the same block to preview a listing as viewers see it;
 * only a draft lacks a name or a category, and says so in their place.
 */
export function ListingHeroText({
  hero,
  nameAs: Name = "h1",
}: {
  hero: ListingHeroData;
  /** `p` where the page has its own heading (CM-03). */
  nameAs?: "h1" | "p";
}) {
  const { offering, operating } = hero;
  return (
    <div className="hero__text">
      {hero.categoryName === null ? (
        <p className="hero__kind">カテゴリーが選ばれていません</p>
      ) : (
        <p className="hero__kind">{hero.categoryName}</p>
      )}
      <Name className="hero__name">{hero.name ?? "名称未設定"}</Name>
      <p className="hero__place">{hero.placeName}</p>
      {offering.phase === "available" && operating === "open" ? null : (
        <StatusTags>
          {offering.phase === "upcoming" ? (
            <StatusTag>{`提供開始前・${offering.startsOn}から`}</StatusTag>
          ) : null}
          {offering.phase === "ended" ? (
            <StatusTag quiet>提供終了</StatusTag>
          ) : null}
          {operating === "temporarilyClosed" ? (
            <StatusTag quiet>お店は休業中</StatusTag>
          ) : null}
          {operating === "permanentlyClosed" ? (
            <StatusTag quiet>お店は閉店しました</StatusTag>
          ) : null}
        </StatusTags>
      )}
      {hero.offeringText === null ? null : (
        <p className="hero__place">{hero.offeringText}</p>
      )}
      {hero.description === null ? null : (
        <p className="hero__description">{hero.description}</p>
      )}
    </div>
  );
}
