import { describe, expect, it } from "vitest";
import { photosTakenMeanwhile } from "../photoTakedown";

const photos = (...ids: string[]) => ids.map((photoId) => ({ photoId }));

describe("photosTakenMeanwhile", () => {
  it("names the takedown when a claim removed a photo the form started from", () => {
    expect(
      photosTakenMeanwhile(
        { photosTakenDown: true, photos: photos("p2") },
        photos("p1", "p2"),
      ),
    ).toBe(true);
  });

  it("names the takedown when a claim removed the last photo", () => {
    expect(
      photosTakenMeanwhile({ photosTakenDown: true, photos: [] }, photos("p1")),
    ).toBe(true);
  });

  it("leaves another manager's save when the photos were taken before the form opened", () => {
    expect(
      photosTakenMeanwhile(
        { photosTakenDown: true, photos: photos("p2") },
        photos("p2"),
      ),
    ).toBe(false);
  });

  it("leaves another manager's save when no claim took photos", () => {
    expect(
      photosTakenMeanwhile(
        { photosTakenDown: false, photos: photos("p2") },
        photos("p1", "p2"),
      ),
    ).toBe(false);
  });
});
