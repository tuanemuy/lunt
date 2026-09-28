import { Account } from "@repo/core/domain/account/entity";
import { Stewardship } from "@repo/core/domain/authority/stewardship";
import { EmailAddress } from "@repo/core/domain/common/emailAddress";
import { PlaceId } from "@repo/core/domain/common/ids";
import { persistStewardship } from "../authority/access";
import { requireAccountByEmail } from "../authority/accounts";
import { ForbiddenError, NotFoundError } from "../errors";
import type { ServiceArgs } from "../types";

export type DevAppointPlaceStewardInput = Readonly<{
  placeId: string;
  email: string;
}>;

/**
 * Development tool: makes an existing account a steward of a store, the
 * way approving a stewardship claim does (`authority.steward_appointed`,
 * `via: "application"`). Stage 2 has no screen that gives a store its
 * first steward — claim approval arrives with S2B — so manual tests and
 * checks of CM-02 / MY-06 seed one here (`/__dev/stewards`). Refused
 * unless the development tools are on.
 */
export async function devAppointPlaceSteward({
  container,
  input,
}: ServiceArgs<DevAppointPlaceStewardInput>): Promise<void> {
  if (!container.runtime.devTools) {
    throw new ForbiddenError(
      "DEV_TOOLS_DISABLED",
      "Development tools are disabled",
    );
  }
  const email = EmailAddress.create(input.email);
  const place = { kind: "place", id: PlaceId.create(input.placeId) } as const;
  await container.unitOfWorkProvider.run(async (ctx) => {
    if ((await ctx.placeRepository.findById(place.id)) === null) {
      throw new NotFoundError("PLACE_NOT_FOUND", "The store does not exist");
    }
    const appointee = await requireAccountByEmail(ctx.accountRepository, email);
    const found = await ctx.stewardshipRepository.findById(place);
    const { entity, eventDrafts } = Stewardship.appointByApproval(
      Stewardship.orVacant(found?.entity ?? null, place),
      { accountId: appointee.entity.id, email: appointee.entity.email },
      container.clock.now(),
    );
    await persistStewardship(ctx, entity, found?.expectedVersion ?? null);
    await ctx.accountRepository.save(
      Account.markReferenced(appointee.entity),
      appointee.expectedVersion,
    );
    ctx.collectEvents(eventDrafts);
  });
}
