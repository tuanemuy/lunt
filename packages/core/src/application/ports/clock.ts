export interface Clock {
  now(): Date;
}

export const SystemClock: Clock = {
  now: () => new Date(),
};

/** `base`, running `offsetMs` ahead (the development clock, F-06). */
export function offsetClock(base: Clock, offsetMs: number): Clock {
  return { now: () => new Date(base.now().getTime() + offsetMs) };
}
