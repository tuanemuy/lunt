import type { DevServices } from "../dev/services";
import { ForbiddenError } from "../errors";
import type { ServiceDeps } from "./serviceDeps";

export function createDevServices(deps: ServiceDeps): DevServices {
  return {
    devClock: deps.runtime.devTools
      ? {
          offsetMs: () => deps.client.devClockOffset(),
          advance: async (ms) => {
            const outcome = await deps.client.devAdvanceClock(ms);
            if (outcome.kind === "refused") {
              throw new ForbiddenError("DEV_CLOCK_REFUSED", outcome.reason);
            }
            return outcome.offsetMs;
          },
        }
      : null,
  };
}
