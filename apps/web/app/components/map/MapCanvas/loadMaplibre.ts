import "maplibre-gl/dist/maplibre-gl.css";
import {
  Map as MapLibreMap,
  Marker,
  NavigationControl,
  setWorkerUrl,
} from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";

// MapLibre finds its worker next to its own module by default, which the
// bundle moves; Vite builds the worker as its own asset instead.
setWorkerUrl(workerUrl);

/** The MapLibre parts the map uses, loaded only in the browser. */
export const maplibre = {
  Map: MapLibreMap,
  Marker,
  NavigationControl,
} as const;
