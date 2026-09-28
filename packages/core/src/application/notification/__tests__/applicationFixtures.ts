import type { PlaceRef } from "@repo/core/domain/authority/stewardship";
import { ApplicationId, type CategoryId } from "@repo/core/domain/common/ids";
import { approveNewListing } from "../../application/approveNewListing";
import { approvePlaceRegistration } from "../../application/approvePlaceRegistration";
import { rejectApplication } from "../../application/rejectApplication";
import { sendBackApplication } from "../../application/sendBackApplication";
import { submitNewListing } from "../../application/submitNewListing";
import { submitPlaceRegistration } from "../../application/submitPlaceRegistration";
import { registerTestPhoto } from "../../media/__tests__/photoFixtures";
import { profileFields } from "../../place/__tests__/kit";
import type { Kit, Person } from "./kit";

/**
 * Applications of the production kinds made through Application's
 * usecases on a notification kit's container, for the rows whose labels
 * name an application's kind and subjects.
 */
export function applicationFixtures(k: Kit) {
  const { container } = k;

  const readVersion = async (id: ApplicationId) => {
    const found = await container.unitOfWorkProvider.run(
      ({ applicationRepository }) => applicationRepository.findById(id),
    );
    if (found === null) throw new Error(`no application ${id}`);
    return found.entity.version;
  };

  /** `who` applies to register a place named `name`, with a companion claim or not. */
  async function registration(
    who: Person,
    name: string,
    options: Readonly<{ companion?: boolean }> = {},
  ) {
    const submitted = await submitPlaceRegistration({
      container,
      actor: who.actor,
      input: {
        applicationId: container.idGenerator.next(),
        profile: profileFields({ name }),
        stewardship: options.companion
          ? {
              applicationId: container.idGenerator.next(),
              relationship: "店主です",
              evidence: "電話で確認できます",
            }
          : null,
      },
    });
    const { registration: Ap1, stewardship } = submitted;
    return {
      Ap1: Ap1.id,
      Ap2: stewardship?.id ?? null,
      placeId: Ap1.reservedPlaceId,
    };
  }

  let category: CategoryId | undefined;

  /** `who` applies for a new listing named `name` of `place` (no steward). */
  async function newListing(who: Person, place: PlaceRef, name: string) {
    category ??= (await k.categories("食べる"))[0];
    const categoryId = category;
    const photoId = await registerTestPhoto(container, who.actor);
    const submitted = await submitNewListing({
      container,
      actor: who.actor,
      input: {
        applicationId: container.idGenerator.next(),
        placeId: place.id,
        content: {
          name,
          description: null,
          categoryId: categoryId ?? null,
          photos: [{ photoId, framing: null }],
          offering: { kind: "none" },
        },
      },
    });
    return ApplicationId.create(submitted.id);
  }

  const sendBack = async (operator: Person, id: ApplicationId) =>
    sendBackApplication({
      container,
      actor: operator.actor,
      input: {
        applicationId: id,
        version: await readVersion(id),
        request: "営業時間を確かめられる資料を添えてください",
      },
    });

  const reject = async (operator: Person, id: ApplicationId) =>
    rejectApplication({
      container,
      actor: operator.actor,
      input: {
        applicationId: id,
        version: await readVersion(id),
        reason: "確認できませんでした",
      },
    });

  const approveRegistration = async (operator: Person, id: ApplicationId) =>
    approvePlaceRegistration({
      container,
      actor: operator.actor,
      input: { applicationId: id, version: await readVersion(id) },
    });

  const approveListing = async (operator: Person, id: ApplicationId) =>
    approveNewListing({
      container,
      actor: operator.actor,
      input: { applicationId: id, version: await readVersion(id) },
    });

  return {
    registration,
    newListing,
    sendBack,
    reject,
    approveRegistration,
    approveListing,
  };
}
