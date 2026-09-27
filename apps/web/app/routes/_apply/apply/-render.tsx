import { createServerFn } from "@tanstack/react-start";
import { renderServerComponent } from "@tanstack/react-start/rsc";
import { z } from "zod";
import { errorResponseMiddleware } from "@/presentation/errorResponseMiddleware";
import { MATCH_TERM_MAX } from "@/presentation/findPlace";
import { validateInput } from "@/presentation/validator";

/**
 * RQ-01's results as an RSC payload, returned unresolved so the loader can
 * forward it and the rows stream in under the skeleton.
 */
export const renderPlaceMatches = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .validator(
    validateInput(
      z.object({
        name: z.string().max(MATCH_TERM_MAX).nullable(),
        address: z.string().max(MATCH_TERM_MAX).nullable(),
      }),
    ),
  )
  .handler(async ({ data }) => {
    const { PlaceMatchesContent } = await import(
      "@/components/request/PlaceMatchesContent"
    );
    return {
      Matches: renderServerComponent(
        <PlaceMatchesContent name={data.name} address={data.address} />,
      ),
    };
  });
