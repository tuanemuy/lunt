import { createServerFn } from "@tanstack/react-start";
import { renderServerComponent } from "@tanstack/react-start/rsc";
import { z } from "zod";
import { errorResponseMiddleware } from "@/presentation/errorResponseMiddleware";
import { opsSearchSearchSchema } from "@/presentation/opsSearch";
import { OPS_SUBJECT_KINDS } from "@/presentation/opsSubject";
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

/** OM-02's results for the URL's search, as an RSC payload. */
export const renderOpsSearch = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .validator(validateInput(opsSearchSearchSchema))
  .handler(async ({ data }) => {
    const { OpsSearchResultsContent } = await import(
      "@/components/ops/OpsSearchResultsContent"
    );
    return {
      Results: renderServerComponent(<OpsSearchResultsContent search={data} />),
    };
  });

/** OM-03's subject, as an RSC payload. */
export const renderOpsSubject = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .validator(
    validateInput(
      z.object({
        kind: z.enum(OPS_SUBJECT_KINDS),
        id: z.string().min(1).max(64),
      }),
    ),
  )
  .handler(async ({ data }) => {
    const { OpsSubjectContent } = await import(
      "@/components/ops/OpsSubjectContent"
    );
    return {
      Subject: renderServerComponent(
        <OpsSubjectContent kind={data.kind} id={data.id} />,
      ),
    };
  });

/** OM-01's four lists, as an RSC payload. */
export const renderOpsInbox = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .handler(async () => {
    const { OpsInboxContent } = await import(
      "@/components/ops/OpsInboxContent"
    );
    return { Inbox: renderServerComponent(<OpsInboxContent />) };
  });

const moderationRef = z.object({ id: z.string().trim().min(1).max(128) });

/** OM-04's claim, as an RSC payload. */
export const renderTakedownClaim = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .validator(validateInput(moderationRef))
  .handler(async ({ data }) => {
    const { TakedownClaimContent } = await import(
      "@/components/ops/TakedownClaimContent"
    );
    return {
      Claim: renderServerComponent(<TakedownClaimContent claimId={data.id} />),
    };
  });

/** OM-05's report, as an RSC payload. */
export const renderInfoReport = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .validator(validateInput(moderationRef))
  .handler(async ({ data }) => {
    const { InfoReportContent } = await import(
      "@/components/ops/InfoReportContent"
    );
    return {
      Report: renderServerComponent(<InfoReportContent reportId={data.id} />),
    };
  });

/** OM-06's categories, as an RSC payload. */
export const renderCategories = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .handler(async () => {
    const { CategoriesContent } = await import(
      "@/components/ops/CategoriesContent"
    );
    return { Categories: renderServerComponent(<CategoriesContent />) };
  });
