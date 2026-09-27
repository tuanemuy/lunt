import { ROLES, type Role } from "@repo/core/domain/authority/role";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { errorResponseMiddleware } from "./errorResponseMiddleware";
import { validateInput } from "./validator";

/** A role holder as OM-07 lists it. */
export type RoleHolderItem = Readonly<{
  accountId: string;
  email: string;
  isSelf: boolean;
}>;

export type RoleHoldersView = Readonly<Record<Role, readonly RoleHolderItem[]>>;

/**
 * `beforeLoad` check of the service-operation screens (OM): the logged-in
 * account must hold the operator role, else `ForbiddenError` (CS-05).
 */
export const requireOperatorFn = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .handler(async () => {
    const [{ getContainer }, { requireActor }, { getMyAuthority }, errors] =
      await Promise.all([
        import("@repo/core/application/di/containerStore"),
        import("./actor"),
        import("@repo/core/application/authority/getMyAuthority"),
        import("@repo/core/application/errors"),
      ]);
    const container = await getContainer();
    const actor = await requireActor(container);
    const { roles } = await getMyAuthority({
      container,
      actor,
      input: { pagination: { page: 1, limit: 1 } },
    });
    if (!roles.includes("operator")) {
      throw new errors.ForbiddenError(
        "OPERATOR_REQUIRED",
        "Only operators may open this screen",
      );
    }
    return null;
  });

const roleField = z.enum(ROLES);

export const grantRoleSchema = z.object({
  role: roleField,
  email: z
    .string()
    .trim()
    .min(1, "メールアドレスを入力してください")
    .max(254, "メールアドレスが長すぎます"),
});

/** OM-07: appoints an editor / grants the operator role by email address. */
export const grantRoleFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .validator(validateInput(grantRoleSchema))
  .handler(async ({ data }) => {
    const [{ getContainer }, { requireActor }, { grantRole }] =
      await Promise.all([
        import("@repo/core/application/di/containerStore"),
        import("./actor"),
        import("@repo/core/application/authority/grantRole"),
      ]);
    const container = await getContainer();
    const actor = await requireActor(container);
    await grantRole({ container, actor, input: data });
    return null;
  });

export const revokeRoleSchema = z.object({
  role: roleField,
  accountId: z.string().min(1).max(64),
});

/** OM-07: removes one holder from a role. */
export const revokeRoleFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .validator(validateInput(revokeRoleSchema))
  .handler(async ({ data }) => {
    const [{ getContainer }, { requireActor }, { revokeRole }, { AccountId }] =
      await Promise.all([
        import("@repo/core/application/di/containerStore"),
        import("./actor"),
        import("@repo/core/application/authority/revokeRole"),
        import("@repo/core/domain/common/ids"),
      ]);
    const container = await getContainer();
    const actor = await requireActor(container);
    await revokeRole({
      container,
      actor,
      input: { role: data.role, accountId: AccountId.create(data.accountId) },
    });
    return null;
  });
