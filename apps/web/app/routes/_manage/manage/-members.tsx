import { createServerFn } from "@tanstack/react-start";
import { renderServerComponent } from "@tanstack/react-start/rsc";
import { errorResponseMiddleware } from "@/presentation/errorResponseMiddleware";
import { memberTargetSchema } from "@/presentation/members";
import { validateInput } from "@/presentation/validator";

/**
 * CM-02's lists as an RSC payload, returned unresolved so the loader can
 * forward it and the lists stream in under the skeleton. Shared by the
 * place / region / event routes.
 */
export const renderMemberBoard = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .validator(validateInput(memberTargetSchema))
  .handler(async ({ data }) => {
    const { MemberBoardContent } = await import(
      "@/components/members/MemberBoardContent"
    );
    return {
      Board: renderServerComponent(<MemberBoardContent target={data} />),
    };
  });
