import {
  InfoReportId,
  PlaceId,
  TakedownClaimId,
} from "@repo/core/domain/common/ids";
import { describe, it } from "vitest";
import { expectCode, type Person } from "../../authority/__tests__/kit";
import { ForbiddenError, NotFoundError } from "../../errors";
import { getInfoReport } from "../getInfoReport";
import { getTakedownClaim } from "../getTakedownClaim";
import { listConfirmationRequestsForPlace } from "../listConfirmationRequestsForPlace";
import { INFO_REPORT_NOT_FOUND, TAKEDOWN_CLAIM_NOT_FOUND } from "../reads";
import { requestInfoReportConfirmation } from "../requestInfoReportConfirmation";
import { resolveInfoReport } from "../resolveInfoReport";
import { resolveTakedownClaim } from "../resolveTakedownClaim";
import { takeDownPhotosByClaim } from "../takeDownPhotosByClaim";
import { moderationKit } from "./kit";

type Kit = Awaited<ReturnType<typeof moderationKit>>;

/** The steward of a place, without the operator role. */
async function outsider(k: Kit): Promise<Person> {
  return k.manager((await k.placeWithPhotos(1, "別の店")).id, "outsider");
}

describe("a missing claim, report or place is reported before access (index.md 「エラーの種類」)", () => {
  const byClaim: ReadonlyArray<
    readonly [
      string,
      (k: Kit, who: Person, claimId: TakedownClaimId) => Promise<unknown>,
    ]
  > = [
    [
      "getTakedownClaim",
      (k, who, claimId) =>
        getTakedownClaim({
          container: k.container,
          actor: who.actor,
          input: { claimId },
        }),
    ],
    [
      "resolveTakedownClaim",
      (k, who, claimId) =>
        resolveTakedownClaim({
          container: k.container,
          actor: who.actor,
          input: { claimId, outcome: "措置を行わない" },
        }),
    ],
    [
      "takeDownPhotosByClaim",
      async (k, who, claimId) => {
        const place = await k.placeWithPhotos(1);
        const [photo] = place.photos;
        if (photo === undefined) throw new Error("no photo");
        return takeDownPhotosByClaim({
          container: k.container,
          actor: who.actor,
          input: {
            claimId,
            target: { kind: "place", id: place.id },
            photoIds: [photo],
          },
        });
      },
    ],
  ];

  for (const [name, call] of byClaim) {
    it(`${name}: someone without the operator role gets NotFoundError for a missing claim, ForbiddenError for an existing one`, async () => {
      const k = await moderationKit();
      const who = await outsider(k);
      await expectCode(
        call(k, who, TakedownClaimId.create(k.newId())),
        NotFoundError,
        TAKEDOWN_CLAIM_NOT_FOUND,
      );
      const place = await k.placeWithPhotos(1);
      const claimId = await k.claim({
        target: { kind: "place", id: place.id },
        photoIds: place.photos.slice(0, 1),
      });
      await expectCode(call(k, who, claimId), ForbiddenError);
    });
  }

  const byReport: ReadonlyArray<
    readonly [
      string,
      (k: Kit, who: Person, reportId: InfoReportId) => Promise<unknown>,
    ]
  > = [
    [
      "getInfoReport",
      (k, who, reportId) =>
        getInfoReport({
          container: k.container,
          actor: who.actor,
          input: { reportId },
        }),
    ],
    [
      "requestInfoReportConfirmation",
      (k, who, reportId) =>
        requestInfoReportConfirmation({
          container: k.container,
          actor: who.actor,
          input: { reportId },
        }),
    ],
    [
      "resolveInfoReport",
      (k, who, reportId) =>
        resolveInfoReport({
          container: k.container,
          actor: who.actor,
          input: { reportId },
        }),
    ],
  ];

  for (const [name, call] of byReport) {
    it(`${name}: someone without the operator role gets NotFoundError for a missing report, ForbiddenError for an existing one`, async () => {
      const k = await moderationKit();
      const who = await outsider(k);
      await expectCode(
        call(k, who, InfoReportId.create(k.newId())),
        NotFoundError,
        INFO_REPORT_NOT_FOUND,
      );
      const place = await k.placeWithPhotos(1);
      await k.manager(place.id);
      const reportId = await k.report(await k.person(), {
        target: { kind: "place", placeId: place.id },
      });
      await expectCode(call(k, who, reportId), ForbiddenError);
    });
  }

  it("listConfirmationRequestsForPlace: the steward of another place gets NotFoundError for a missing place, ForbiddenError for an existing one", async () => {
    const k = await moderationKit();
    const who = await outsider(k);
    const list = (placeId: PlaceId) =>
      listConfirmationRequestsForPlace({
        container: k.container,
        actor: who.actor,
        input: { placeId, pagination: { page: 1, limit: 10 } },
      });
    await expectCode(
      list(PlaceId.create(k.newId())),
      NotFoundError,
      "PLACE_NOT_FOUND",
    );
    await expectCode(list((await k.placeWithPhotos(1)).id), ForbiddenError);
  });
});
