/**
 * OpenFreeMap's Positron (https://openfreemap.org): OpenStreetMap vector
 * tiles with no API key and no request limit; attribution is required and
 * comes from the tiles' TileJSON through the attribution control.
 * `MAP_STYLE_URL` replaces it (`./mapStyle.ts`). A module of its own, free
 * of the server function, so map components can import it.
 */
export const DEFAULT_MAP_STYLE_URL =
  "https://tiles.openfreemap.org/styles/positron";
