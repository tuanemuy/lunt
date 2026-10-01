type PhotoRef = Readonly<{ photoId: string }>;

/**
 * Whether a claim's photo takedown (CS-16) removed photos an edit form
 * started from, read from the loader's copy after a refused save's
 * reconcile: the cause of the conflict (CS-07) is then the operators'
 * takedown, not another manager's save.
 */
export function photosTakenMeanwhile(
  fresh: Readonly<{ photosTakenDown: boolean; photos: readonly PhotoRef[] }>,
  startedFrom: readonly PhotoRef[],
): boolean {
  return (
    fresh.photosTakenDown &&
    startedFrom.some(
      (photo) => !fresh.photos.some((kept) => kept.photoId === photo.photoId),
    )
  );
}
