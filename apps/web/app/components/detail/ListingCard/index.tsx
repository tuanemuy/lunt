import { Link } from "@tanstack/react-router";
import { Photo } from "@/components/ui/Photo";
import type { ListingCardItem } from "@/presentation/detailView";

/**
 * What a listing card shows: photo, name, place, region, and — in the
 * reference scene — the offering state. No price or tagline. CM-03 shows
 * it without the link to preview the card.
 */
export function ListingCardBody({ item }: { item: ListingCardItem }) {
  return (
    <>
      <Photo photo={item.photo} alt="" ratio={1} className="card__photo" />
      <p className="card__name">{item.name}</p>
      <p className="card__shop">{item.placeName}</p>
      {item.regionName === null ? null : (
        <p className="card__area">{item.regionName}</p>
      )}
      {item.state === null ? null : <p className="card__state">{item.state}</p>}
    </>
  );
}

/**
 * Lunt/DiscoverCard (20:28) of a listing, leading to its DT-01. The save
 * toggle (CF-04) joins with stage 4.
 */
export function ListingCard({ item }: { item: ListingCardItem }) {
  return (
    <article className="card">
      <Link
        className="card__link"
        to="/listings/$listingId"
        params={{ listingId: item.listingId }}
      >
        <ListingCardBody item={item} />
      </Link>
    </article>
  );
}

/** Cards in the design's 2 / 3 / 4-column grid. */
export function ListingCards({ items }: { items: readonly ListingCardItem[] }) {
  return (
    <div className="card-grid">
      {items.map((item) => (
        <ListingCard key={item.listingId} item={item} />
      ))}
    </div>
  );
}
