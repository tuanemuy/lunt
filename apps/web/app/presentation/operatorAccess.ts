// Server-only: import from server components or server-function handlers
// (dynamically), never from client components.
import { getMyAuthority } from "@repo/core/application/authority/getMyAuthority";
import type { RequestContainer } from "@repo/core/application/di/types";
import { ForbiddenError } from "@repo/core/application/errors";
import type { Actor } from "@repo/core/domain/common/actor";

/** Whether the actor holds the operator role. */
export async function isOperator(
  container: RequestContainer,
  actor: Actor,
): Promise<boolean> {
  const { roles } = await getMyAuthority({
    container,
    actor,
    input: { pagination: { page: 1, limit: 1 } },
  });
  return roles.includes("operator");
}

/**
 * The service-operation screens' check (OM area guard, OM-03's loader):
 * `ForbiddenError` (CS-05) unless the actor is an operator.
 */
export async function requireOperator(
  container: RequestContainer,
  actor: Actor,
): Promise<void> {
  if (!(await isOperator(container, actor))) {
    throw new ForbiddenError(
      "OPERATOR_REQUIRED",
      "Only operators may open this screen",
    );
  }
}
