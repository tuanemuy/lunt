import type {
  ExpressionSpecification,
  LayerSpecification,
  StyleSpecification,
  SymbolLayerSpecification,
} from "maplibre-gl";

/**
 * OpenFreeMap's Positron (https://openfreemap.org): OpenStreetMap vector
 * tiles with no API key and no request limit; attribution is required and
 * comes from the tiles' TileJSON through the attribution control.
 * `MAP_STYLE_URL` replaces it (`apps/web/app/presentation/mapStyle.ts`).
 */
export const DEFAULT_MAP_STYLE_URL =
  "https://tiles.openfreemap.org/styles/positron";

/** The MapCanvas palette of `spec/design/assets/map-canvas.svg`. */
const PALETTE = {
  ground: "#F3F1EB",
  green: "#EAF0E7",
  wood: "#E3EADF",
  water: "#D6E0DD",
  road: "#FFFEFA",
  casing: "#DFE3DA",
  minor: "#E9EAE3",
  building: "#ECEAE3",
  label: "#4F594E",
  place: "#273B33",
  halo: "#FFFEFA",
} as const;

type Paint = Readonly<Record<string, string>>;

const PAINT_BY_LAYER: Readonly<Record<string, Paint>> = {
  background: { "background-color": PALETTE.ground },
  park: { "fill-color": PALETTE.green },
  landcover_wood: { "fill-color": PALETTE.wood },
  landuse_residential: { "fill-color": PALETTE.ground },
  water: { "fill-color": PALETTE.water },
  waterway: { "line-color": PALETTE.water },
  building: {
    "fill-color": PALETTE.building,
    "fill-outline-color": PALETTE.casing,
  },
  road_area_pier: { "fill-color": PALETTE.ground },
  road_pier: { "line-color": PALETTE.ground },
  highway_path: { "line-color": PALETTE.minor },
  highway_minor: { "line-color": PALETTE.road },
  highway_major_casing: { "line-color": PALETTE.casing },
  highway_major_inner: { "line-color": PALETTE.road },
  highway_motorway_casing: { "line-color": PALETTE.casing },
  highway_motorway_inner: { "line-color": PALETTE.road },
  highway_motorway_bridge_casing: { "line-color": PALETTE.casing },
  highway_motorway_bridge_inner: { "line-color": PALETTE.road },
  tunnel_motorway_casing: { "line-color": PALETTE.casing },
  tunnel_motorway_inner: { "line-color": PALETTE.road },
};

/** Japanese names first; the style's default shows Latin and local both. */
const JAPANESE_NAME: ExpressionSpecification = [
  "coalesce",
  ["get", "name:ja"],
  ["get", "name"],
];

/**
 * Road numbers and footpath names crowd the pins; the MapCanvas sheet
 * shows streets and areas only.
 */
const HIDDEN_LAYERS: ReadonlySet<string> = new Set([
  "highway-shield-non-us",
  "highway-shield-us-interstate",
  "road_shield_us",
  "highway-name-path",
]);

const showsName = (layer: SymbolLayerSpecification): boolean =>
  JSON.stringify(layer.layout?.["text-field"] ?? null).includes('"name');

function tintLayer(layer: LayerSpecification): LayerSpecification {
  const paint = PAINT_BY_LAYER[layer.id];
  if (layer.type === "symbol") {
    if (HIDDEN_LAYERS.has(layer.id)) {
      return { ...layer, layout: { ...layer.layout, visibility: "none" } };
    }
    const isPlace = layer["source-layer"] === "place";
    return {
      ...layer,
      ...(showsName(layer)
        ? { layout: { ...layer.layout, "text-field": JAPANESE_NAME } }
        : {}),
      paint: {
        ...layer.paint,
        "text-color": isPlace ? PALETTE.place : PALETTE.label,
        "text-halo-color": PALETTE.halo,
      },
    };
  }
  if (paint === undefined) return layer;
  // Every entry of PAINT_BY_LAYER names a colour property of that layer's
  // own type, so the merged paint stays that type's paint.
  return {
    ...layer,
    paint: { ...layer.paint, ...paint },
  } as LayerSpecification;
}

/**
 * The default style drawn in Lunt's MapCanvas colours with Japanese
 * labels. Only for `DEFAULT_MAP_STYLE_URL`: another style is used as-is.
 */
export function tintStyle(style: StyleSpecification): StyleSpecification {
  return { ...style, layers: style.layers.map(tintLayer) };
}
