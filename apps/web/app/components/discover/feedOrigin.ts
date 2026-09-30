export type FeedOrigin = Readonly<{ latitude: number; longitude: number }>;

/**
 * The viewer's position the feed is ordered by (「現在地を利用中」), kept in
 * this tab's memory so VW-01's loader reads it synchronously — returning
 * from a detail then finds the same feed in the loader cache, at the same
 * scroll position. `null` on the server and until the position is known;
 * a new tab starts without it, a reload of this one asks the browser again.
 */
let current: FeedOrigin | null = null;

/** Fixed to 4 decimals (about 11 m): a jittering fix does not reorder the feed. */
const rounded = (value: number): number => Math.round(value * 10_000) / 10_000;

export const feedOrigin = {
  get: (): FeedOrigin | null => current,
  /** Sets the origin; `true` when it changed (the feed must be read again). */
  set: (next: FeedOrigin | null): boolean => {
    const value =
      next === null
        ? null
        : {
            latitude: rounded(next.latitude),
            longitude: rounded(next.longitude),
          };
    if (
      value?.latitude === current?.latitude &&
      value?.longitude === current?.longitude
    ) {
      return false;
    }
    current = value;
    return true;
  },
};

/** A stable key of an origin (`-` for none), part of the feed's key. */
export const originKey = (origin: FeedOrigin | null): string =>
  origin === null ? "-" : `${origin.latitude},${origin.longitude}`;
