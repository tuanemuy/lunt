import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { z } from "zod";
import { ViewerShell } from "@/components/layout/ViewerShell";
import {
  CurrentLocationChip,
  LocationFeedback,
} from "@/components/map/CurrentLocation";
import { centerOf } from "@/components/map/geometry";
import { MapCanvas } from "@/components/map/MapCanvas";
import type {
  MapBounds,
  MapPin,
  MapPinEmphasis,
  MapViewport,
  MapViewportChange,
} from "@/components/map/types";
import { useCurrentLocation } from "@/components/map/useCurrentLocation";
import { ButtonLink } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { TextButton, TextLink } from "@/components/ui/TextButton";
import { requireDevTools } from "@/presentation/devTools";
import { loadMapStyleFn } from "@/presentation/mapStyle";

const searchSchema = z.object({
  tiles: z.enum(["ok", "broken"]).optional().catch(undefined),
  // A stand-in position ("35.68,139.76") where the browser cannot share one.
  at: z
    .string()
    .regex(/^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/)
    .optional()
    .catch(undefined),
});

/**
 * Development specimen of the map parts (VW-04, VW-08): real tiles, sample
 * pins of every kind, selection, the viewer's position and CS-03, and the
 * map-unavailable fallback (`?tiles=broken`); `?at=lat,lng` stands in for
 * the browser's position.
 */
export const Route = createFileRoute("/__dev/ui/map")({
  validateSearch: searchSchema,
  beforeLoad: () => requireDevTools(),
  loader: () => loadMapStyleFn(),
  head: () => ({ meta: [{ title: "Map — Lunt" }] }),
  component: MapGallery,
});

const point = (latitude: number, longitude: number) => ({
  latitude,
  longitude,
});

const bounds = (
  south: number,
  west: number,
  north: number,
  east: number,
): MapBounds => ({
  southWest: point(south, west),
  northEast: point(north, east),
});

const KANDA = bounds(35.688, 139.758, 35.702, 139.776);
const CLUSTER_EXTENT = bounds(35.6975, 139.7695, 35.6995, 139.7725);

type Sample = Readonly<{
  key: string;
  build: (selected: boolean, emphasis: MapPinEmphasis | undefined) => MapPin;
  member: boolean;
}>;

const SAMPLES: readonly Sample[] = [
  {
    key: "place-hibi",
    member: true,
    build: (selected, emphasis) => ({
      kind: "target",
      target: "place",
      key: "place-hibi",
      position: point(35.6935, 139.7632),
      label: "喫茶 日々",
      selected,
      emphasis,
    }),
  },
  {
    key: "colocated-nagi",
    member: true,
    build: (selected, emphasis) => ({
      kind: "colocated",
      key: "colocated-nagi",
      position: point(35.6912, 139.7688),
      label: "同じ位置の店舗 2 件",
      count: 2,
      selected,
      emphasis,
    }),
  },
  {
    key: "cluster-akihabara",
    member: false,
    build: (_selected, emphasis) => ({
      kind: "cluster",
      key: "cluster-akihabara",
      position: centerOf(CLUSTER_EXTENT),
      label: "店舗 3 件（まとめたピン。選ぶと拡大）",
      count: 3,
      extent: CLUSTER_EXTENT,
      emphasis,
    }),
  },
  {
    key: "listing-parfait",
    member: false,
    build: (selected, emphasis) => ({
      kind: "target",
      target: "listing",
      key: "listing-parfait",
      position: point(35.6958, 139.7598),
      label: "いちじくのパフェ",
      selected,
      emphasis,
    }),
  },
  {
    key: "occasion-yorimichi",
    member: false,
    build: (selected, emphasis) => ({
      kind: "target",
      target: "occasion",
      key: "occasion-yorimichi",
      position: point(35.6902, 139.7735),
      label: "よりみち市",
      selected,
      emphasis,
    }),
  },
];

const REGIONS = [
  {
    key: "region-komorebi",
    name: "こもれび商店街",
    position: point(35.6948, 139.7655),
  },
  {
    key: "region-shiranami",
    name: "白波横丁",
    position: point(35.6995, 139.7625),
  },
] as const;

function MapGallery() {
  const { styleUrl } = Route.useLoaderData();
  const { tiles, at } = Route.useSearch();
  const [atLatitude, atLongitude] = (at ?? "").split(",").map(Number);
  const standIn =
    atLatitude === undefined || atLongitude === undefined || at === undefined
      ? null
      : { latitude: atLatitude, longitude: atLongitude };
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [viewport, setViewport] = useState<MapViewport>({
    kind: "bounds",
    bounds: KANDA,
  });
  const [researching, setResearching] = useState(false);
  const [lastChange, setLastChange] = useState<MapViewportChange | null>(null);
  const [unavailableReported, setUnavailableReported] = useState(false);
  const { location, start, stop } = useCurrentLocation();

  const selectedRegion = REGIONS.find((region) => region.key === selectedKey);
  const pins = useMemo<readonly MapPin[]>(
    () => [
      ...SAMPLES.map((sample) =>
        sample.build(
          sample.key === selectedKey,
          selectedRegion === undefined
            ? undefined
            : sample.member
              ? "member"
              : "other",
        ),
      ),
      ...REGIONS.map(
        (region): MapPin => ({
          kind: "region",
          key: region.key,
          name: region.name,
          position: region.position,
          label: `まち ${region.name}`,
          selected: region.key === selectedKey,
        }),
      ),
    ],
    [selectedKey, selectedRegion],
  );

  return (
    <ViewerShell header={{ type: "home" }} current="map">
      <div className="container flex flex-col gap-16 py-21">
        <div className="flex flex-col gap-8">
          <h1 className="font-display text-page tracking-display">
            地図の部品
          </h1>
          <p className="text-meta text-secondary">
            VW-04・VW-08 の MapCanvas。スタイル: {styleUrl}
          </p>
          <div className="flex flex-wrap items-center gap-8">
            <CurrentLocationChip
              location={location}
              onStart={start}
              onStop={stop}
            />
            <Chip
              selected={researching}
              onClick={() => setResearching((value) => !value)}
            >
              再検索中
            </Chip>
            <TextButton
              onClick={() => setViewport({ kind: "bounds", bounds: KANDA })}
            >
              初めの範囲へ
            </TextButton>
            {tiles === "broken" ? (
              <TextLink to="/__dev/ui/map" search={{}}>
                地図を戻す
              </TextLink>
            ) : (
              <TextLink to="/__dev/ui/map" search={{ tiles: "broken" }}>
                地図の取得に失敗させる
              </TextLink>
            )}
          </div>
        </div>

        {location.status === "unavailable" ? (
          <LocationFeedback
            reason={location.reason}
            onRetry={start}
            areaAction={
              <ButtonLink to="/__dev/ui" variant="secondary">
                エリアを選ぶ
              </ButtonLink>
            }
          />
        ) : null}

        <MapCanvas
          styleUrl={
            tiles === "broken"
              ? "https://tiles.invalid/styles/none.json"
              : styleUrl
          }
          label="地図"
          viewport={viewport}
          pins={pins}
          userLocation={
            standIn ?? (location.status === "on" ? location.position : null)
          }
          status={researching ? "この範囲を探しています" : null}
          onSelect={(pin) =>
            setSelectedKey(
              pin === null || pin.kind === "cluster" ? null : pin.key,
            )
          }
          onViewportChange={setLastChange}
          onUnavailable={() => setUnavailableReported(true)}
          unavailableActions={<TextLink to="/__dev/ui">まちを探す</TextLink>}
        />

        <dl className="grid grid-cols-[auto_1fr] gap-x-16 gap-y-4 text-meta text-secondary">
          <dt>選択</dt>
          <dd>{selectedKey ?? "なし"}</dd>
          <dt>範囲</dt>
          <dd data-testid="map-bounds">
            {lastChange === null
              ? "—"
              : `${lastChange.cause} z${lastChange.zoom.toFixed(2)} ` +
                `${lastChange.bounds.southWest.latitude.toFixed(4)},` +
                `${lastChange.bounds.southWest.longitude.toFixed(4)} – ` +
                `${lastChange.bounds.northEast.latitude.toFixed(4)},` +
                `${lastChange.bounds.northEast.longitude.toFixed(4)} ` +
                `(${lastChange.size.width}×${lastChange.size.height})`}
          </dd>
          <dt>現在地</dt>
          <dd>
            {location.status}
            {location.status === "unavailable" ? ` (${location.reason})` : ""}
          </dd>
          <dt>取得失敗</dt>
          <dd>{unavailableReported ? "通知あり" : "なし"}</dd>
        </dl>
      </div>
    </ViewerShell>
  );
}
