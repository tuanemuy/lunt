import type { StewardedKind } from "@repo/core/domain/common/refs";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { errorResponseMiddleware } from "./errorResponseMiddleware";
import type { PlaceFrame } from "./placeView";
import type { RegionFrame } from "./regionView";
import { parseGeneratedId, validateInput } from "./validator";

/**
 * CM-02 メンバーの管理 (`spec/pages/shared.md`): the types, words and server
 * functions shared by its place / region / event routes. Server-only
 * reads live in `membersData.ts`.
 */

/** The stewarded target's segment in `/manage/{places|regions|events}/$id/members`. */
export const MEMBER_ROUTE_SEGMENT: Readonly<Record<StewardedKind, string>> = {
  place: "places",
  region: "regions",
  occasion: "events",
};

/** The words that change with the kind of target (「店舗管理者」「地域運営者」…). */
export type MemberWords = Readonly<{
  /** 店舗管理者 / 地域運営者 / イベント運営者 */
  role: string;
  /** 店舗 / 地域 / イベント */
  target: string;
  /** 管理 / 運営 */
  verb: string;
  /** The brand band's label when a manager opens it. */
  area: string;
  /** What the target keeps when its last manager leaves (「管理者不在」). */
  vacancy: readonly string[];
}>;

export const MEMBER_WORDS: Readonly<Record<StewardedKind, MemberWords>> = {
  place: {
    role: "店舗管理者",
    target: "店舗",
    verb: "管理",
    area: "お店の管理",
    vacancy: [
      "店舗の公開は続きます",
      "掲載は、下書きを含めてサービス運営者の管理下に入ります",
      "店舗管理者として行った確認中・差し戻し中の申請は、失効します",
    ],
  },
  region: {
    role: "地域運営者",
    target: "地域",
    verb: "運営",
    area: "地域の運営",
    vacancy: [
      "地域の公開は続きます",
      "サービス運営者が、地域の運営者として運営します",
    ],
  },
  occasion: {
    role: "イベント運営者",
    target: "イベント",
    verb: "運営",
    area: "イベントの運営",
    vacancy: [
      "イベントの公開は続きます",
      "サービス運営者が、イベントの運営者として運営します",
    ],
  },
};

/**
 * Who opened CM-02 and what it is about: its frame (brand band, title
 * band, nav) follows the viewer's standing — a manager of the target sees
 * its management nav, any other operator the service-operation nav.
 */
export type MembersFrame = Readonly<{
  kind: StewardedKind;
  id: string;
  name: string;
  /** 営業中 · 公開中 (as a steward sees it) / 店舗 · 営業中 · 公開中 · 管理者のいない店舗 (as an operator). */
  state: string;
  steward: boolean;
  operator: boolean;
  /** A store's management frame (switcher, nav) when its steward opens it. */
  shop: PlaceFrame | null;
  /** A region's management frame (nav) when its steward opens it. */
  region: RegionFrame | null;
}>;

export type MemberItem = Readonly<{
  accountId: string;
  email: string;
  isSelf: boolean;
  /** Shown before the server has confirmed it (an optimistic row). */
  pending?: boolean;
}>;

export type InvitationItem = Readonly<{
  invitationId: string;
  email: string;
  /** ISO 8601; `null` for an optimistic row. */
  invitedAt: string | null;
  pending?: boolean;
}>;

/** CM-02's lists and the operations the viewer's standing allows. */
export type MemberBoardData = Readonly<{
  kind: StewardedKind;
  id: string;
  name: string;
  vacant: boolean;
  /** Oldest appointment first. */
  stewards: readonly MemberItem[];
  /** Oldest invitation first. */
  invitations: readonly InvitationItem[];
  /** The viewer manages the target: invite, cancel, resign. */
  steward: boolean;
  /** The viewer is an operator: revoke; cancel while the target is vacant. */
  operator: boolean;
}>;

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** `9月20日に招待`, on the Japan-time calendar day of `iso`. */
export function invitedOnText(iso: string): string {
  const day = new Date(new Date(iso).getTime() + JST_OFFSET_MS);
  return `${day.getUTCMonth() + 1}月${day.getUTCDate()}日に招待`;
}

const kindField = z.enum(["place", "region", "occasion"]);
const idField = z.string().trim().min(1).max(128);

export const memberTargetSchema = z.object({ kind: kindField, id: idField });

export type MemberTargetInput = z.infer<typeof memberTargetSchema>;

/**
 * CM-02's guard and frame (`beforeLoad`): the target, and whether the
 * viewer manages it and / or operates the service. `ForbiddenError` for
 * anyone else (CS-05), `NotFoundError` for a missing target (CS-17).
 */
export const loadMembersFrameFn = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .validator(validateInput(memberTargetSchema))
  .handler(async ({ data }): Promise<MembersFrame> => {
    const { loadMembersFrame } = await import("./membersData");
    return loadMembersFrame(data);
  });

const emailField = z
  .string()
  .trim()
  .min(1, "メールアドレスを入力してください")
  .max(254, "メールアドレスが長すぎます");

export const inviteMemberSchema = memberTargetSchema.extend({
  invitationId: z.string().min(1).max(64),
  email: emailField,
});

/**
 * Invites an address to manage the target (idempotent create: the
 * client mints `invitationId` and resends it until the outcome is final).
 * The invitation mail goes out through the notification delivery.
 */
export const inviteMemberFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .validator(validateInput(inviteMemberSchema))
  .handler(async ({ data }) => {
    const [
      { getContainer },
      { requireActor },
      { inviteMember },
      { StewardedRef },
    ] = await Promise.all([
      import("@repo/core/application/di/containerStore"),
      import("./actor"),
      import("@repo/core/application/authority/inviteMember"),
      import("@repo/core/domain/common/refs"),
    ]);
    const container = await getContainer();
    const actor = await requireActor(container);
    await inviteMember({
      container,
      actor,
      input: {
        target: StewardedRef.create(data.kind, data.id),
        invitationId: parseGeneratedId(
          container.idGenerator,
          "invitationId",
          data.invitationId,
        ),
        email: data.email,
      },
    });
    return null;
  });

export const cancelInvitationSchema = memberTargetSchema.extend({
  invitationId: z.string().min(1).max(64),
});

/** Cancels a pending invitation (a manager; an operator while the target is vacant). */
export const cancelInvitationFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .validator(validateInput(cancelInvitationSchema))
  .handler(async ({ data }) => {
    const [
      { getContainer },
      { requireActor },
      { cancelInvitation },
      { StewardedRef },
      { InvitationId },
    ] = await Promise.all([
      import("@repo/core/application/di/containerStore"),
      import("./actor"),
      import("@repo/core/application/authority/cancelInvitation"),
      import("@repo/core/domain/common/refs"),
      import("@repo/core/domain/common/ids"),
    ]);
    const container = await getContainer();
    const actor = await requireActor(container);
    await cancelInvitation({
      container,
      actor,
      input: {
        target: StewardedRef.create(data.kind, data.id),
        invitationId: InvitationId.create(data.invitationId),
      },
    });
    return null;
  });

export const revokeStewardSchema = memberTargetSchema.extend({
  accountId: z.string().min(1).max(64),
});

/** An operator removes one manager from the target (MEM-05). */
export const revokeStewardFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .validator(validateInput(revokeStewardSchema))
  .handler(async ({ data }) => {
    const [
      { getContainer },
      { requireActor },
      { revokeSteward },
      { StewardedRef },
      { AccountId },
    ] = await Promise.all([
      import("@repo/core/application/di/containerStore"),
      import("./actor"),
      import("@repo/core/application/authority/revokeSteward"),
      import("@repo/core/domain/common/refs"),
      import("@repo/core/domain/common/ids"),
    ]);
    const container = await getContainer();
    const actor = await requireActor(container);
    await revokeSteward({
      container,
      actor,
      input: {
        target: StewardedRef.create(data.kind, data.id),
        accountId: AccountId.create(data.accountId),
      },
    });
    return null;
  });

/** The viewer gives up managing the target (MEM-04). */
export const resignStewardshipFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .validator(validateInput(memberTargetSchema))
  .handler(async ({ data }) => {
    const [
      { getContainer },
      { requireActor },
      { resignStewardship },
      { StewardedRef },
    ] = await Promise.all([
      import("@repo/core/application/di/containerStore"),
      import("./actor"),
      import("@repo/core/application/authority/resignStewardship"),
      import("@repo/core/domain/common/refs"),
    ]);
    const container = await getContainer();
    const actor = await requireActor(container);
    await resignStewardship({
      container,
      actor,
      input: { target: StewardedRef.create(data.kind, data.id) },
    });
    return null;
  });

export const grantStewardshipSchema = z.object({
  kind: z.enum(["region", "occasion"]),
  id: idField,
  email: emailField,
});

/**
 * An operator makes an existing account a manager of a region or an
 * event (CM-02 付与; REG-12, EVT-12). Stores are never granted.
 */
export const grantStewardshipFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .validator(validateInput(grantStewardshipSchema))
  .handler(async ({ data }) => {
    const [
      { getContainer },
      { requireActor },
      { grantStewardship },
      { OccasionId, RegionId },
    ] = await Promise.all([
      import("@repo/core/application/di/containerStore"),
      import("./actor"),
      import("@repo/core/application/authority/grantStewardship"),
      import("@repo/core/domain/common/ids"),
    ]);
    const container = await getContainer();
    const actor = await requireActor(container);
    await grantStewardship({
      container,
      actor,
      input: {
        target:
          data.kind === "region"
            ? { kind: "region", id: RegionId.create(data.id) }
            : { kind: "occasion", id: OccasionId.create(data.id) },
        email: data.email,
      },
    });
    return null;
  });
