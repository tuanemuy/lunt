import { createServerFn } from "@tanstack/react-start";
import { renderServerComponent } from "@tanstack/react-start/rsc";
import { z } from "zod";
import { errorResponseMiddleware } from "@/presentation/errorResponseMiddleware";
import { validateInput } from "@/presentation/validator";

/**
 * OM-07's lists as an RSC payload, returned unresolved so the loader can
 * forward it and the lists stream in under the skeleton.
 */
export const renderRoleHolders = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .validator(validateInput(z.object({ fromWithdrawal: z.boolean() })))
  .handler(async ({ data }) => {
    const { RoleHoldersContent } = await import(
      "@/components/ops/RoleHoldersContent"
    );
    return {
      RoleHolders: renderServerComponent(
        <RoleHoldersContent fromWithdrawal={data.fromWithdrawal} />,
      ),
    };
  });
