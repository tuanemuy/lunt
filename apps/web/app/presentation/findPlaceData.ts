// Server-only: import from server components or server-function handlers
// (dynamically), never from client components.
import { getContainer } from "@repo/core/application/di/containerStore";
import { matchPlaces } from "@repo/core/application/place/matchPlaces";
import { BusinessRuleError } from "@repo/core/domain/error";
import { PlaceErrorCode } from "@repo/core/domain/place/errorCode";
import {
  PLACE_MATCH_PAGE_SIZE,
  type PlaceMatchPage,
  toPlaceMatchPage,
} from "./findPlace";

const NOTHING_ENTERED: readonly string[] = [
  PlaceErrorCode.InvalidMatchCriteria,
  PlaceErrorCode.InvalidMatchText,
];

/**
 * One page of places matching the name and / or address. Terms that
 * normalize to nothing are 「何も入力せずに探す」 (CS-10), a state rather
 * than an error, so it can be shown inside the streamed results.
 */
export async function loadPlaceMatches(
  input: Readonly<{
    name: string | null;
    address: string | null;
    page: number;
  }>,
): Promise<PlaceMatchPage> {
  const container = await getContainer();
  try {
    return toPlaceMatchPage(
      await matchPlaces({
        container,
        input: {
          name: input.name,
          address: input.address,
          pagination: { page: input.page, limit: PLACE_MATCH_PAGE_SIZE },
        },
      }),
    );
  } catch (error) {
    if (
      error instanceof BusinessRuleError &&
      NOTHING_ENTERED.includes(error.code)
    ) {
      return { kind: "invalid" };
    }
    throw error;
  }
}
