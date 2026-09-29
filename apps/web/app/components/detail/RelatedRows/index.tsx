import { Link } from "@tanstack/react-router";
import { cx } from "@/components/ui/cx";
import { Photo } from "@/components/ui/Photo";
import {
  HOLDING_STATUS_TEXT,
  type OccasionRowItem,
  type PlaceRowItem,
  type RegionRowItem,
} from "@/presentation/detailView";

type RowsProps = {
  /** Two columns from `md` (DT-03's full-width sections). */
  grid?: boolean;
};

/** Lunt/ContentRow of a region, leading to its DT-03. */
export function RegionRow({ item }: { item: RegionRowItem }) {
  return (
    <Link
      className="content-row"
      to="/regions/$regionId"
      params={{ regionId: item.regionId }}
    >
      <Photo
        photo={item.photo}
        alt=""
        ratio={1}
        className="content-row__photo"
      />
      <div className="content-row__body">
        <p className="content-row__name">{item.name}</p>
        <p className="content-row__meta">
          {item.tagline ?? "この街を歩いてみる"}
        </p>
        <p className="content-row__area">{item.area}</p>
      </div>
    </Link>
  );
}

/** The regions of a detail (DT-01, DT-02, DT-04), in the order given. */
export function RegionRows({
  items,
  grid = false,
}: RowsProps & { items: readonly RegionRowItem[] }) {
  return (
    <div className={cx("detail-rows", grid && "detail-rows--grid")}>
      {items.map((item) => (
        <RegionRow key={item.regionId} item={item} />
      ))}
    </div>
  );
}

/**
 * Lunt/ContentRow of an occasion, leading to its DT-04: its period, and
 * its holding status (開催予定 / 開催中 in the discovery scene).
 */
export function OccasionRow({ item }: { item: OccasionRowItem }) {
  return (
    <Link
      className="content-row"
      to="/events/$occasionId"
      params={{ occasionId: item.occasionId }}
    >
      <Photo
        photo={item.photo}
        alt=""
        ratio={1}
        className="content-row__photo"
      />
      <div className="content-row__body">
        <p className="content-row__name">{item.name}</p>
        <p className="content-row__meta">{item.periodText}</p>
        <p className="content-row__area">{HOLDING_STATUS_TEXT[item.holding]}</p>
      </div>
    </Link>
  );
}

/** The occasions of a detail (DT-01, DT-02, DT-03), in 開催日の順. */
export function OccasionRows({
  items,
  grid = false,
}: RowsProps & { items: readonly OccasionRowItem[] }) {
  return (
    <div className={cx("detail-rows", grid && "detail-rows--grid")}>
      {items.map((item) => (
        <OccasionRow key={item.occasionId} item={item} />
      ))}
    </div>
  );
}

/**
 * Lunt/ContentRow of a place, leading to its DT-02: its locality with the
 * temporary or permanent closure, and the region the list names.
 */
export function PlaceRow({
  item,
  meta,
}: {
  item: PlaceRowItem;
  /** What the second line says instead of the locality (DT-04: 参加日). */
  meta?: string;
}) {
  const closure =
    item.operating === "temporarilyClosed"
      ? "休業中"
      : item.operating === "permanentlyClosed"
        ? "閉店"
        : null;
  const line = meta ?? item.area;
  return (
    <Link
      className="content-row"
      to="/places/$placeId"
      params={{ placeId: item.placeId }}
    >
      <Photo
        photo={item.photo}
        alt=""
        ratio={1}
        className="content-row__photo"
      />
      <div className="content-row__body">
        <p className="content-row__name">{item.name}</p>
        <p className="content-row__meta">
          {closure === null ? line : `${line} · ${closure}`}
        </p>
        {item.regionName === null ? null : (
          <p className="content-row__area">{item.regionName}</p>
        )}
      </div>
    </Link>
  );
}
