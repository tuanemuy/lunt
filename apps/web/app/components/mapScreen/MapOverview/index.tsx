"use client";

import { Link } from "@tanstack/react-router";
import { IconButton } from "@/components/ui/IconButton";
import { Photo } from "@/components/ui/Photo";
import { StatusTag } from "@/components/ui/StatusTag";
import { TextButton } from "@/components/ui/TextButton";
import {
  closureText,
  type MapPlaceItem,
  type MapRegionItem,
} from "@/presentation/mapView";

function PlaceBody({ place }: { place: MapPlaceItem }) {
  const closure = closureText(place.operating);
  return (
    <>
      <Photo
        photo={place.photo}
        alt=""
        ratio={1}
        className="content-row__photo"
      />
      <span className="content-row__body">
        <span className="content-row__name">{place.name}</span>
        <span className="content-row__meta">{place.address}</span>
        {place.regionName === null ? null : (
          <span className="content-row__area">{place.regionName}</span>
        )}
        {closure === null ? null : (
          <StatusTag quiet={place.operating === "permanentlyClosed"}>
            {closure}
          </StatusTag>
        )}
      </span>
    </>
  );
}

/** Lunt/ContentRow of a place leading to its DT-02 (list and overview). */
export function MapPlaceRow({ place }: { place: MapPlaceItem }) {
  return (
    <Link
      className="content-row"
      to="/places/$placeId"
      params={{ placeId: place.placeId }}
    >
      <PlaceBody place={place} />
    </Link>
  );
}

/** Lunt/ContentRow of a region leading to its DT-03 (list and overview). */
export function MapRegionRow({
  region,
  note,
}: {
  region: MapRegionItem;
  /** A last line, e.g. how its places are told apart on the map. */
  note?: string;
}) {
  return (
    <Link
      className="content-row"
      to="/regions/$regionId"
      params={{ regionId: region.regionId }}
    >
      <Photo
        photo={region.photo}
        alt=""
        ratio={1}
        className="content-row__photo"
      />
      <span className="content-row__body">
        <span className="content-row__name">{region.name}</span>
        <span className="content-row__meta">{region.area}</span>
        {note === undefined ? null : (
          <span className="content-row__area">{note}</span>
        )}
      </span>
    </Link>
  );
}

type CloseProps = { onClose: () => void };

/**
 * 店舗を選択中: the chosen place's photo, name, address, region and
 * closure, leading to DT-02; 選択をやめる beside it.
 */
export function PlaceOverview({
  place,
  onClose,
}: CloseProps & { place: MapPlaceItem }) {
  return (
    <div className="map-overview">
      <MapPlaceRow place={place} />
      <IconButton icon="close" label="選択をやめる" neutral onClick={onClose} />
    </div>
  );
}

/**
 * 地域を選択中: the region's photo, name and address leading to DT-03,
 * and how its places are told apart.
 */
export function RegionOverview({
  region,
  onClose,
}: CloseProps & { region: MapRegionItem }) {
  return (
    <div className="map-overview">
      <MapRegionRow region={region} note="緑の枠のピンが、この街のお店です" />
      <IconButton icon="close" label="選択をやめる" neutral onClick={onClose} />
    </div>
  );
}

/**
 * 同じ位置の店舗を選択中: the places at one spot; choosing one shows its
 * overview.
 */
export function SpotList({
  title,
  places,
  onChoose,
  onClose,
}: CloseProps & {
  title: string;
  places: readonly MapPlaceItem[];
  onChoose: (place: MapPlaceItem) => void;
}) {
  return (
    <div className="map-spot">
      <p className="map-spot__title">{title}</p>
      <ul className="map-spot__list">
        {places.map((place) => (
          <li key={place.placeId}>
            <button
              type="button"
              className="content-row"
              onClick={() => onChoose(place)}
            >
              <PlaceBody place={place} />
            </button>
          </li>
        ))}
      </ul>
      <TextButton onClick={onClose}>選択をやめる</TextButton>
    </div>
  );
}
