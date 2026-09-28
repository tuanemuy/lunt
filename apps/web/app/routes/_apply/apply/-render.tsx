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

// The application screens' bodies (RQ-02〜RQ-04). These endpoints can be
// called without the routes' guard; the loaders behind them take the actor
// with `requireActor`, and the bodies render their own common states.

const idField = z.string().min(1).max(64);
const entrySchema = z.object({
  resubmit: idField.nullable(),
  reapply: idField.nullable(),
});

/** RQ-02 登録. */
export const renderRegistration = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .validator(validateInput(entrySchema))
  .handler(async ({ data }) => {
    const { RegistrationContent } = await import(
      "@/components/apply/ApplyContent"
    );
    return {
      Content: renderServerComponent(<RegistrationContent entry={data} />),
    };
  });

/** RQ-02 修正. */
export const renderPlaceRevision = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .validator(validateInput(entrySchema.extend({ placeId: idField })))
  .handler(async ({ data }) => {
    const { PlaceRevisionContent } = await import(
      "@/components/apply/ApplyContent"
    );
    const { placeId, ...entry } = data;
    return {
      Content: renderServerComponent(
        <PlaceRevisionContent placeId={placeId} entry={entry} />,
      ),
    };
  });

/** RQ-03. */
export const renderStewardship = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .validator(validateInput(entrySchema.extend({ placeId: idField })))
  .handler(async ({ data }) => {
    const { StewardshipContent } = await import(
      "@/components/apply/ApplyContent"
    );
    const { placeId, ...entry } = data;
    return {
      Content: renderServerComponent(
        <StewardshipContent placeId={placeId} entry={entry} />,
      ),
    };
  });

/** RQ-04 新しい掲載. */
export const renderNewListingApply = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .validator(validateInput(entrySchema.extend({ placeId: idField })))
  .handler(async ({ data }) => {
    const { NewListingApplyContent } = await import(
      "@/components/apply/ApplyContent"
    );
    const { placeId, ...entry } = data;
    return {
      Content: renderServerComponent(
        <NewListingApplyContent placeId={placeId} entry={entry} />,
      ),
    };
  });

/** RQ-04 修正. */
export const renderListingRevisionApply = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .validator(validateInput(entrySchema.extend({ listingId: idField })))
  .handler(async ({ data }) => {
    const { ListingRevisionApplyContent } = await import(
      "@/components/apply/ApplyContent"
    );
    const { listingId, ...entry } = data;
    return {
      Content: renderServerComponent(
        <ListingRevisionApplyContent listingId={listingId} entry={entry} />,
      ),
    };
  });
