import type { StewardedKind } from "@repo/core/domain/common/refs";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { errorResponseMiddleware } from "./errorResponseMiddleware";
import { validateInput } from "./validator";

/**
 * MY-06 招待の承諾 (`spec/pages/account.md`). An invitation is found by its
 * target and id, so the target travels as `?kind=&id=` next to
 * `/invitations/$invitationId` (`notificationDestination.ts`).
 */

const kindField = z.enum(["place", "region", "occasion"]);

/** The URL's target: a hand-edited value reads as no target (the invitation is not found). */
export const invitationSearchSchema = z.object({
  kind: kindField.optional().catch(undefined),
  id: z.string().trim().min(1).max(128).optional().catch(undefined),
});

export type InvitationTarget = Readonly<{
  kind: StewardedKind;
  id: string;
  /** `null` for a target without a name (an unnamed draft region / event). */
  name: string | null;
}>;

/** MY-06's states before accepting (`checkInvitation`). */
export type InvitationView =
  | Readonly<{
      status: "acceptable";
      target: InvitationTarget;
      /** The signed-in account's address — the invited one. */
      email: string;
    }>
  | Readonly<{
      status: "addressed_to_other";
      /** The signed-in account's address, which is not the invited one. */
      email: string;
    }>
  | Readonly<{ status: "not_found" }>
  | Readonly<{
      status: "already_steward";
      target: InvitationTarget;
    }>;

export const checkInvitationSchema = z.object({
  invitationId: z.string().trim().min(1).max(128),
  kind: kindField.optional(),
  id: z.string().trim().min(1).max(128).optional(),
});

/**
 * Whether the signed-in account can accept the invitation, and what it is
 * for. Reasons it cannot are states, not errors; an invitation whose
 * target the URL does not name reads as not found.
 */
export const checkInvitationFn = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .validator(validateInput(checkInvitationSchema))
  .handler(async ({ data }): Promise<InvitationView> => {
    if (data.kind === undefined || data.id === undefined) {
      return { status: "not_found" };
    }
    const { kind, id } = data;
    const [
      { getContainer },
      { requireActor },
      { checkInvitation },
      { getMyAccount },
      { StewardedRef },
      { InvitationId },
    ] = await Promise.all([
      import("@repo/core/application/di/containerStore"),
      import("./actor"),
      import("@repo/core/application/authority/checkInvitation"),
      import("@repo/core/application/account/getMyAccount"),
      import("@repo/core/domain/common/refs"),
      import("@repo/core/domain/common/ids"),
    ]);
    const container = await getContainer();
    const actor = await requireActor(container);
    const target = StewardedRef.create(kind, id);
    const [result, account] = await Promise.all([
      checkInvitation({
        container,
        actor,
        input: { target, invitationId: InvitationId.create(data.invitationId) },
      }),
      getMyAccount({ container, actor }),
    ]);
    switch (result.status) {
      case "acceptable":
        return {
          status: "acceptable",
          target: { kind, id, name: result.name },
          email: account.email,
        };
      case "addressed_to_other":
        return { status: "addressed_to_other", email: account.email };
      case "already_steward":
        return {
          status: "already_steward",
          target: { kind, id, name: result.name },
        };
      case "not_found":
        return { status: "not_found" };
    }
  });

export const acceptInvitationSchema = z.object({
  invitationId: z.string().trim().min(1).max(128),
  kind: kindField,
  id: z.string().trim().min(1).max(128),
});

/** Accepts: the signed-in account becomes a manager of the target. */
export const acceptInvitationFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .validator(validateInput(acceptInvitationSchema))
  .handler(async ({ data }) => {
    const [
      { getContainer },
      { requireActor },
      { acceptInvitation },
      { StewardedRef },
      { InvitationId },
    ] = await Promise.all([
      import("@repo/core/application/di/containerStore"),
      import("./actor"),
      import("@repo/core/application/authority/acceptInvitation"),
      import("@repo/core/domain/common/refs"),
      import("@repo/core/domain/common/ids"),
    ]);
    const container = await getContainer();
    const actor = await requireActor(container);
    await acceptInvitation({
      container,
      actor,
      input: {
        target: StewardedRef.create(data.kind, data.id),
        invitationId: InvitationId.create(data.invitationId),
      },
    });
    return null;
  });

/** The management home a new manager goes to: SM-01, RM-01 or EM-01 (plain paths). */
export function managementHomePath(kind: StewardedKind, id: string): string {
  const segment =
    kind === "place" ? "places" : kind === "region" ? "regions" : "events";
  return `/manage/${segment}/${encodeURIComponent(id)}`;
}
