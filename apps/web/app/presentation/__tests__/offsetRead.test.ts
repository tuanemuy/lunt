import { describe, expect, it } from "vitest";
import {
  type CountedPage,
  readContinuation,
  readFromOffset,
} from "../offsetRead";

const rows = (n: number) => Array.from({ length: n }, (_, i) => `r${i}`);

function pagedReader(list: () => readonly string[], size: number) {
  const pages: number[] = [];
  const read = async (page: number): Promise<CountedPage<string>> => {
    pages.push(page);
    const all = list();
    return {
      items: all.slice((page - 1) * size, page * size),
      count: all.length,
    };
  };
  return { read, pages };
}

describe("readFromOffset", () => {
  it("reads one page when the offset is on a page boundary", async () => {
    const { read, pages } = pagedReader(() => rows(25), 10);
    const page = await readFromOffset(10, 10, read);
    expect(page).toEqual({ items: rows(20).slice(10), count: 25 });
    expect(pages).toEqual([2]);
  });

  it("joins the page holding the offset and the next one", async () => {
    const { read, pages } = pagedReader(() => rows(25), 10);
    const page = await readFromOffset(9, 10, read);
    expect(page).toEqual({ items: rows(19).slice(9), count: 25 });
    expect(pages).toEqual([1, 2]);
  });

  it("reads what is left at the end", async () => {
    const { read } = pagedReader(() => rows(25), 10);
    expect(await readFromOffset(23, 10, read)).toEqual({
      items: ["r23", "r24"],
      count: 25,
    });
    expect(await readFromOffset(25, 10, read)).toEqual({
      items: [],
      count: 25,
    });
  });
});

/**
 * A screen's list over a server list that changes under it: `size` rows a
 * page, rows removed from the server stay shown (as VW-10 keeps them,
 * marked), and the cursor is shifted only for the changes the screen
 * knows of (`known: false` leaves it to the read).
 */
function screen(total: number, size: number) {
  let server = rows(total);
  const { read } = pagedReader(() => server, size);
  const shown: string[] = server.slice(0, size);
  let cursor = { offset: shown.length, ended: shown.length >= server.length };
  let reads = 0;
  return {
    remove(row: string, known = true) {
      server = server.filter((each) => each !== row);
      if (known) cursor = { ...cursor, offset: cursor.offset - 1 };
    },
    saveAgain(row: string) {
      server = [row, ...server];
      cursor = { ...cursor, offset: cursor.offset + 1 };
    },
    async loadMore() {
      const result = await readContinuation({
        offset: cursor.offset,
        isShown: (row: string) => shown.includes(row),
        readFrom: async (offset) => {
          reads += 1;
          return readFromOffset(offset, size, read);
        },
      });
      shown.push(...result.items);
      cursor = { offset: result.next, ended: result.ended };
    },
    async loadAll() {
      for (let i = 0; i < 50 && !cursor.ended; i++) await this.loadMore();
    },
    shown: () => shown,
    ended: () => cursor.ended,
    reads: () => reads,
  };
}

describe("readContinuation", () => {
  it("continues a list nothing changed in one read per page", async () => {
    const s = screen(250, 100);
    await s.loadAll();
    expect(s.shown()).toEqual(rows(250));
    expect(s.reads()).toBe(2);
  });

  it("shows every save after removing the first row (VW-10, 105 saves)", async () => {
    const s = screen(105, 100);
    s.remove("r0");
    await s.loadAll();
    expect(s.shown()).toEqual(rows(105));
    expect(s.reads()).toBe(1);
  });

  it("shows every save after removing two rows", async () => {
    const s = screen(105, 100);
    s.remove("r0");
    s.remove("r57");
    await s.loadAll();
    expect(s.shown()).toEqual(rows(105));
  });

  it("does not repeat a row saved again before the next read", async () => {
    const s = screen(105, 100);
    s.remove("r3");
    s.saveAgain("r3");
    await s.loadAll();
    expect(s.shown()).toEqual(rows(105));
  });

  it("keeps going across reads with removals and saves again in between", async () => {
    const s = screen(260, 100);
    s.remove("r10");
    await s.loadMore();
    s.remove("r150");
    s.remove("r20");
    s.saveAgain("r10");
    await s.loadAll();
    expect(s.shown()).toEqual(rows(260));
  });

  it("steps back over removals it was not told of (a removal landing before the read, another screen)", async () => {
    const s = screen(90, 20);
    await s.loadMore();
    s.remove("r5", false);
    s.remove("r30", false);
    s.remove("r31", false);
    await s.loadAll();
    expect(s.shown()).toEqual(rows(90));
  });

  it("gets past more unknown removals than a page", async () => {
    const s = screen(200, 20);
    await s.loadMore();
    for (let i = 0; i < 35; i++) s.remove(`r${i}`, false);
    await s.loadAll();
    expect(s.shown()).toEqual(rows(200));
  });

  it("ends when the removals leave nothing beyond the rows shown", async () => {
    const s = screen(45, 20);
    await s.loadMore();
    s.remove("r1");
    s.remove("r44", false);
    await s.loadAll();
    expect(s.ended()).toBe(true);
    expect(s.shown()).toEqual(rows(44));
  });

  it("does not show a row twice when a row is added ahead", async () => {
    let server = rows(30);
    const shown = server.slice(0, 20);
    server = ["new", ...server];
    const result = await readContinuation({
      offset: 20,
      isShown: (row: string) => shown.includes(row),
      readFrom: async (offset) => ({
        items: server.slice(offset, offset + 20),
        count: server.length,
      }),
    });
    expect(result.items).toEqual(rows(30).slice(20));
    expect(result.ended).toBe(true);
  });
});
