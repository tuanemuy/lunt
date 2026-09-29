"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Feedback } from "@/components/ui/Feedback";
import { Photo } from "@/components/ui/Photo";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { Tab, Tabs } from "@/components/ui/Tabs";
import type { RegionDetailData } from "@/presentation/detailView";
import { ListingCards } from "../ListingCard";
import { OccasionRows, PlaceRow } from "../RelatedRows";

type RegionTab = "discover" | "places" | "events";

const FEATURE_RATIO = 348 / 193;

/** EditorialFeature of the region: area, tagline, cover, name, introduction. */
function RegionFeature({ data }: { data: RegionDetailData }) {
  const [cover, ...rest] = data.photos;
  return (
    <>
      <div className="feature">
        <div className="feature__head">
          <p className="feature__location">{data.area}</p>
          {data.tagline === null ? null : (
            <p className="feature__catch">{data.tagline}</p>
          )}
        </div>
        <Photo
          photo={cover?.photo ?? null}
          alt={cover?.alt ?? ""}
          ratio={FEATURE_RATIO}
          className="feature__photo"
          priority
        />
        <div className="feature__foot">
          <h1 className="feature__name">{data.name}</h1>
          {data.description === null ? null : (
            <p className="feature__description">{data.description}</p>
          )}
        </div>
      </div>
      {rest.length === 0 ? null : (
        <ul className="detail-gallery dt03-gallery" aria-label="ほかの写真">
          {rest.map((item, index) => (
            <li key={item.photo?.src ?? `missing-${index}`}>
              <Photo
                photo={item.photo}
                alt={item.alt}
                ratio={1}
                className="detail-gallery__photo"
              />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/**
 * DT-03 地域詳細 (`spec/pages/detail.md`): the region (EditorialFeature),
 * then its sections in the discovery scene behind the Region tabs —
 * 見つかる (the listings of its places, newest first, and its occasions),
 * 店舗 (its places, newest affiliation first) and イベント (its upcoming
 * and ongoing occasions in 開催日の順). A tab with nothing to show is
 * left out; without listings 見つかる says so (CS-09) and leads to the
 * places. Each section shows its first six: the full lists (VW-06), the
 * map (VW-04), the other regions (VW-05), the articles and the procedure
 * entries (RQ-05, RQ-07 of a region) arrive with their stages.
 */
export function RegionDetail({ data }: { data: RegionDetailData }) {
  const [tab, setTab] = useState<RegionTab>("discover");
  const hasPlaces = data.places.length > 0;
  const hasEvents = data.occasions.length > 0;
  const shown: RegionTab =
    (tab === "places" && !hasPlaces) || (tab === "events" && !hasEvents)
      ? "discover"
      : tab;
  return (
    <div className="container detail-page">
      <div className="detail">
        {shown === "discover" ? (
          <RegionFeature data={data} />
        ) : (
          <h1 className="dt03-title">{data.name}</h1>
        )}

        {hasPlaces || hasEvents ? (
          <Tabs label="この街で見る" className="dt03-tabs">
            <Tab
              selected={shown === "discover"}
              onClick={() => setTab("discover")}
            >
              見つかる
            </Tab>
            {hasPlaces ? (
              <Tab
                selected={shown === "places"}
                onClick={() => setTab("places")}
              >
                店舗
              </Tab>
            ) : null}
            {hasEvents ? (
              <Tab
                selected={shown === "events"}
                onClick={() => setTab("events")}
              >
                イベント
              </Tab>
            ) : null}
          </Tabs>
        ) : null}

        {shown === "discover" ? (
          <>
            {data.listings.length > 0 ? (
              <section className="detail-section" aria-label="この街の掲載">
                <ListingCards items={data.listings} />
              </section>
            ) : (
              <div className="dt03-empty">
                <Feedback
                  kind="empty"
                  icon="region"
                  title="この街の掲載は、まだありません。"
                  {...(hasPlaces
                    ? {
                        body: "所属するお店から、街の様子をたどれます。",
                        action: (
                          <Button
                            variant="secondary"
                            onClick={() => setTab("places")}
                          >
                            お店を見る
                          </Button>
                        ),
                      }
                    : {})}
                />
              </div>
            )}
            {hasEvents ? (
              <section className="detail-section" aria-labelledby="dt03-events">
                <SectionTitle id="dt03-events">街のイベント</SectionTitle>
                <OccasionRows items={data.occasions} grid />
              </section>
            ) : null}
          </>
        ) : null}

        {shown === "places" ? (
          <section className="detail-section" aria-label="この街のお店">
            <div className="detail-rows detail-rows--grid">
              {data.places.map((place) => (
                <PlaceRow key={place.placeId} item={place} />
              ))}
            </div>
          </section>
        ) : null}

        {shown === "events" ? (
          <section className="detail-section" aria-label="この街のイベント">
            <OccasionRows items={data.occasions} grid />
          </section>
        ) : null}
      </div>
    </div>
  );
}
