const KEY = "lunt:own-article-publications";

/*
 * The articles this browser tab published itself, each with the version
 * the publish left. CM-03 reopened on an article still at that version
 * (the browser's back from its DT-05) was published by the viewer, not by
 * another editor. Any later change moves the version on, and the screen
 * says again that the article is already published (CS-08). Session
 * storage may refuse or be empty: the screen then falls back to CS-08.
 */

function readAll(): Readonly<Record<string, number>> {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (raw === null) return {};
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null) return {};
    return Object.fromEntries(
      Object.entries(value).filter(
        (entry): entry is [string, number] => typeof entry[1] === "number",
      ),
    );
  } catch {
    return {};
  }
}

/** Records that the viewer published `articleId`, leaving it at `version`. */
export function rememberOwnPublication(
  articleId: string,
  version: number,
): void {
  try {
    sessionStorage.setItem(
      KEY,
      JSON.stringify({ ...readAll(), [articleId]: version }),
    );
  } catch {
    // Storage refused: a reopened CM-03 shows CS-08.
  }
}

/** Whether `articleId` at `version` is as the viewer's own publish left it. */
export function isOwnPublication(articleId: string, version: number): boolean {
  return readAll()[articleId] === version;
}
