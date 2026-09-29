import { createServerFn } from "@tanstack/react-start";
import { renderServerComponent } from "@tanstack/react-start/rsc";
import { z } from "zod";
import { errorResponseMiddleware } from "@/presentation/errorResponseMiddleware";
import { validateInput } from "@/presentation/validator";

// The EM screens' bodies and CM-04 as RSC payloads, returned unresolved so
// each loader can forward them and the body streams in under its skeleton.
// These endpoints can be called without the area's guard, so every body's
// loader repeats its check; the bodies render their own CS-17 / CS-05 /
// CS-15.

const idField = z.string().min(1).max(64);
const occasionRef = z.object({ occasionId: idField });

/** EM-01, with the place a notification pointed at. */
export const renderParticipantBoard = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .validator(
    validateInput(occasionRef.extend({ participant: idField.optional() })),
  )
  .handler(async ({ data }) => {
    const { ParticipantBoardContent } = await import(
      "@/components/event/ParticipantBoardContent"
    );
    return {
      Content: renderServerComponent(
        <ParticipantBoardContent
          occasionId={data.occasionId}
          participant={data.participant ?? null}
        />,
      ),
    };
  });

/** EM-02 (編集), and whether it was just registered. */
export const renderOccasionEditor = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .validator(validateInput(occasionRef.extend({ created: z.boolean() })))
  .handler(async ({ data }) => {
    const { OccasionEditorContent } = await import(
      "@/components/event/OccasionEditorContent"
    );
    return {
      Content: renderServerComponent(
        <OccasionEditorContent
          occasionId={data.occasionId}
          created={data.created}
        />,
      ),
    };
  });

/** EM-02 (新規). */
export const renderNewOccasion = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .handler(async () => {
    const { NewOccasionContent } = await import(
      "@/components/event/OccasionEditorContent"
    );
    return { Content: renderServerComponent(<NewOccasionContent />) };
  });

/** EM-03. */
export const renderRegionLinks = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .validator(validateInput(occasionRef))
  .handler(async ({ data }) => {
    const { RegionLinksContent } = await import(
      "@/components/event/RegionLinksContent"
    );
    return {
      Content: renderServerComponent(
        <RegionLinksContent occasionId={data.occasionId} />,
      ),
    };
  });

/**
 * CM-04 from either side: the place's steward (`side: "place"`) or the
 * event's operator; `placeId` is absent while the operator's add has not
 * picked a place yet.
 */
export const renderParticipationEditor = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .validator(
    validateInput(
      occasionRef.extend({
        side: z.enum(["place", "occasion"]),
        mode: z.enum(["edit", "add"]),
        placeId: idField.optional(),
      }),
    ),
  )
  .handler(async ({ data }) => {
    const { ParticipationEditorContent } = await import(
      "@/components/event/ParticipationEditorContent"
    );
    return {
      Content: renderServerComponent(
        <ParticipationEditorContent
          side={data.side}
          mode={data.mode}
          occasionId={data.occasionId}
          placeId={data.placeId ?? null}
        />,
      ),
    };
  });
