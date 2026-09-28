import { createServerFn } from "@tanstack/react-start";
import { renderServerComponent } from "@tanstack/react-start/rsc";
import { z } from "zod";
import { errorResponseMiddleware } from "@/presentation/errorResponseMiddleware";
import { validateInput } from "@/presentation/validator";

/**
 * MY-04's list as an RSC payload, returned unresolved so the loader can
 * forward it and the list streams in under the skeleton. The store filter
 * was checked in `beforeLoad` (CS-05).
 */
export const renderMyApplications = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .validator(
    validateInput(
      z.object({ place: z.string().trim().min(1).max(128).nullable() }),
    ),
  )
  .handler(async ({ data }) => {
    const { MyApplicationsContent } = await import(
      "@/components/application/MyApplicationsContent"
    );
    return {
      Applications: renderServerComponent(
        <MyApplicationsContent place={data.place} />,
      ),
    };
  });
