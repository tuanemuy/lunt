import { createServerFn } from "@tanstack/react-start";
import { renderServerComponent } from "@tanstack/react-start/rsc";
import { z } from "zod";
import { errorResponseMiddleware } from "@/presentation/errorResponseMiddleware";
import { validateInput } from "@/presentation/validator";

// SM-05 and SM-06 bodies as RSC payloads, returned unresolved so each
// loader can forward them and the body streams in under its skeleton.
// Their usecases check `act_as_place` themselves, so calling these
// endpoints without the area's guard reads nothing it should not.

const placeRef = z.object({ placeId: z.string().min(1).max(64) });

/** SM-05. */
export const renderAffiliationStatus = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .validator(validateInput(placeRef))
  .handler(async ({ data }) => {
    const { AffiliationStatusContent } = await import(
      "@/components/manage/AffiliationStatusContent"
    );
    return {
      Content: renderServerComponent(
        <AffiliationStatusContent placeId={data.placeId} />,
      ),
    };
  });

/** SM-06. */
export const renderShopEvents = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .validator(validateInput(placeRef))
  .handler(async ({ data }) => {
    const { ShopEventsContent } = await import(
      "@/components/manage/ShopEventsContent"
    );
    return {
      Content: renderServerComponent(
        <ShopEventsContent placeId={data.placeId} />,
      ),
    };
  });
