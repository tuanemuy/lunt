import { describe, expect, it } from "vitest";
import { feedPageSchema } from "../discover";
import { FEED_MAX_PAGE } from "../discoverView";

const request = (page: number) => ({
  search: {},
  origin: null,
  page,
});

describe("feedPageSchema", () => {
  it("accepts a further page up to the feed's depth", () => {
    expect(feedPageSchema.parse(request(2)).page).toBe(2);
    expect(feedPageSchema.parse(request(FEED_MAX_PAGE)).page).toBe(
      FEED_MAX_PAGE,
    );
  });

  it("refuses a page past the feed's depth", () => {
    expect(feedPageSchema.safeParse(request(FEED_MAX_PAGE + 1)).success).toBe(
      false,
    );
  });
});
