import { ListingId, PlaceId } from "@repo/core/domain/common/ids";
import { describe, it } from "vitest";
import { expectCode, type Person } from "../../authority/__tests__/kit";
import { ForbiddenError, NotFoundError } from "../../errors";
import { createListingDraft } from "../createListingDraft";
import { deleteListing } from "../deleteListing";
import { duplicateListing } from "../duplicateListing";
import { endListingOffering } from "../endListingOffering";
import { getManagedListing } from "../getManagedListing";
import { listPlaceListings } from "../listPlaceListings";
import { previewListing } from "../previewListing";
import { publishListing } from "../publishListing";
import { resumeListingOffering } from "../resumeListingOffering";
import { suspendListing } from "../suspendListing";
import { unpublishListing } from "../unpublishListing";
import { unsuspendListing } from "../unsuspendListing";
import { updateListing } from "../updateListing";
import { listingKit } from "./kit";

type Kit = Awaited<ReturnType<typeof listingKit>>;
type ByListing = (
  k: Kit,
  who: Person,
  listingId: ListingId,
) => Promise<unknown>;

const byId =
  (
    usecase: (
      args: Readonly<{
        container: Kit["container"];
        actor: Person["actor"];
        input: Readonly<{ listingId: ListingId }>;
      }>,
    ) => Promise<unknown>,
  ): ByListing =>
  (k, who, listingId) =>
    usecase({ container: k.container, actor: who.actor, input: { listingId } });

const byListing: ReadonlyArray<readonly [string, ByListing]> = [
  ["getManagedListing", byId(getManagedListing)],
  ["previewListing", byId(previewListing)],
  [
    "updateListing",
    (k, who, listingId) =>
      updateListing({
        container: k.container,
        actor: who.actor,
        input: { listingId, version: 1, content: k.content({ photos: [] }) },
      }),
  ],
  ["publishListing", byId(publishListing)],
  ["unpublishListing", byId(unpublishListing)],
  ["endListingOffering", byId(endListingOffering)],
  ["resumeListingOffering", byId(resumeListingOffering)],
  ["suspendListing", byId(suspendListing)],
  ["unsuspendListing", byId(unsuspendListing)],
  ["deleteListing", byId(deleteListing)],
  [
    "duplicateListing",
    (k, who, sourceId) =>
      duplicateListing({
        container: k.container,
        actor: who.actor,
        input: { sourceId, listingId: k.newId() },
      }),
  ],
];

/** The manager of another place: refused on the place asked about. */
async function outsider(k: Kit): Promise<Person> {
  return k.manager(await k.place("別の店"), "outsider");
}

describe("a missing listing or place is reported before access (index.md 「エラーの種類」)", () => {
  for (const [name, call] of byListing) {
    it(`${name}: the manager of another place gets NotFoundError for a missing listing, ForbiddenError for an existing one`, async () => {
      const k = await listingKit();
      const who = await outsider(k);
      await expectCode(
        call(k, who, ListingId.create(k.newId())),
        NotFoundError,
        "LISTING_NOT_FOUND",
      );
      const placeId = await k.place();
      const existing = await k.draft(await k.manager(placeId), placeId);
      await expectCode(call(k, who, existing.id), ForbiddenError);
    });
  }

  const byPlace: ReadonlyArray<
    readonly [
      string,
      (k: Kit, who: Person, placeId: PlaceId) => Promise<unknown>,
    ]
  > = [
    [
      "createListingDraft",
      (k, who, placeId) =>
        createListingDraft({
          container: k.container,
          actor: who.actor,
          input: {
            listingId: k.newId(),
            placeId,
            content: k.content({ photos: [] }),
          },
        }),
    ],
    [
      "listPlaceListings",
      (k, who, placeId) =>
        listPlaceListings({
          container: k.container,
          actor: who.actor,
          input: {
            placeId,
            shelf: { publication: null, phase: null },
            pagination: { page: 1, limit: 10 },
          },
        }),
    ],
  ];

  for (const [name, call] of byPlace) {
    it(`${name}: the manager of another place gets NotFoundError for a missing place, ForbiddenError for an existing one`, async () => {
      const k = await listingKit();
      const who = await outsider(k);
      await expectCode(
        call(k, who, PlaceId.create(k.newId())),
        NotFoundError,
        "PLACE_NOT_FOUND",
      );
      await expectCode(call(k, who, await k.place()), ForbiddenError);
    });
  }
});
