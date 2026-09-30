/** A page of a page-numbered read: its rows and the count of all rows. */
export type CountedPage<T> = Readonly<{ items: readonly T[]; count: number }>;

/**
 * Up to `size` rows from row `offset` (0-based) of a list read a page of
 * `size` at a time (`page` from 1): the page holding `offset` and, when
 * `offset` falls inside it, the next one (read together; a page past the
 * end reads empty).
 */
export async function readFromOffset<T>(
  offset: number,
  size: number,
  read: (page: number) => Promise<CountedPage<T>>,
): Promise<CountedPage<T>> {
  const page = Math.floor(offset / size) + 1;
  const skip = offset % size;
  if (skip === 0) return read(page);
  const [head, tail] = await Promise.all([read(page), read(page + 1)]);
  return {
    items: [...head.items, ...tail.items].slice(skip, skip + size),
    count: tail.count,
  };
}

/** What a 「続き」 read brought: the rows not shown yet, and where the next one starts. */
export type Continuation<T> = Readonly<{
  items: readonly T[];
  /** The offset of the row after the last one read, in the list as it was read. */
  next: number;
  count: number;
  /** The read reached the end of the list. */
  ended: boolean;
}>;

/** How many times a read steps back before it takes what it has. */
const MAX_STEPS = 8;

/**
 * The 「続き」 (CF-05) of a list read by row offset while rows may leave
 * it: `offset` is where the continuation stood (the rows ahead of it, as
 * last known), and the read starts one row earlier, at a row already
 * shown. If that row is not one shown, rows ahead of the continuation left
 * the list since (removed on this screen or elsewhere) and moved the rest
 * up; the read steps back (1, 2, 4… rows) until it starts on a shown row,
 * so no row is skipped. Rows already shown are left out, so a row that
 * moved down (or a row added ahead) is not shown twice.
 */
export async function readContinuation<T>({
  offset,
  isShown,
  readFrom,
}: Readonly<{
  offset: number;
  isShown: (item: T) => boolean;
  /** A window of rows from an offset, e.g. `readFromOffset` over a paged read. */
  readFrom: (offset: number) => Promise<CountedPage<T>>;
}>): Promise<Continuation<T>> {
  let from = Math.max(0, offset - 1);
  let step = 1;
  for (let attempt = 0; ; attempt += 1) {
    const page = await readFrom(from);
    const head = page.items[0];
    const anchored = from === 0 || (head !== undefined && isShown(head));
    if (anchored || attempt === MAX_STEPS) {
      const next = from + page.items.length;
      return {
        items: page.items.filter((item) => !isShown(item)),
        next,
        count: page.count,
        ended: next >= page.count,
      };
    }
    from =
      head === undefined
        ? Math.max(0, Math.min(from - step, page.count - 1))
        : Math.max(0, from - step);
    step *= 2;
  }
}
