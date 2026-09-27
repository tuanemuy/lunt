// Server-only: import from server components or server-function handlers
// (dynamically), never from client components.
import { getMyAuthority } from "@repo/core/application/authority/getMyAuthority";
import { viewMembers } from "@repo/core/application/authority/viewMembers";
import { getContainer } from "@repo/core/application/di/containerStore";
import type { RequestContainer } from "@repo/core/application/di/types";
import { NotFoundError } from "@repo/core/application/errors";
import { getManagedPlace } from "@repo/core/application/place/getManagedPlace";
import type { Actor } from "@repo/core/domain/common/actor";
import { PlaceId } from "@repo/core/domain/common/ids";
import { StewardedRef } from "@repo/core/domain/common/refs";
import type { OperatingStatus } from "@repo/core/domain/place/operatingStatus";
import { requireActor } from "./actor";
import type {
  MemberBoardData,
  MembersFrame,
  MemberTargetInput,
} from "./members";
import { loadPlaceFrame } from "./shopData";

const OPERATING: Readonly<Record<OperatingStatus, string>> = {
  open: "営業中",
  temporarilyClosed: "休業",
  permanentlyClosed: "閉店",
};

function placeState(
  operatingStatus: OperatingStatus,
  suspended: boolean,
): string {
  return `${OPERATING[operatingStatus]} · ${suspended ? "店舗は非公開" : "公開中"}`;
}

/** An id that cannot name a place names no target (CS-17), not an input error. */
function placeIdOf(raw: string): PlaceId {
  try {
    return PlaceId.create(raw);
  } catch {
    throw new NotFoundError("PLACE_NOT_FOUND", `No place has the id ${raw}`);
  }
}

async function isOperator(
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

type TargetFacts = Readonly<{
  name: string;
  state: string;
  steward: boolean;
  vacant: boolean;
}>;

/**
 * The target's name and state, read with an access check: its managers
 * and operators may (`inspect_target`), anyone else gets `ForbiddenError`.
 * Regions and occasions land in stage 3 (S3A); until then no target of
 * those kinds exists (CS-17).
 */
async function readTarget(
  container: RequestContainer,
  actor: Actor,
  input: MemberTargetInput,
): Promise<TargetFacts> {
  if (input.kind !== "place") {
    throw new NotFoundError(
      "STEWARDED_TARGET_NOT_FOUND",
      `No ${input.kind} ${input.id} exists before its stage`,
    );
  }
  const view = await getManagedPlace({
    container,
    actor,
    input: { placeId: placeIdOf(input.id) },
  });
  return {
    name: view.place.profile.name,
    state: placeState(view.place.operatingStatus, view.suspended),
    steward: view.management.allowed && view.management.basis === "steward",
    vacant: !view.hasSteward,
  };
}

/** See `loadMembersFrameFn`. */
export async function loadMembersFrame(
  input: MemberTargetInput,
): Promise<MembersFrame> {
  const container = await getContainer();
  const actor = await requireActor(container);
  const [target, operator] = await Promise.all([
    readTarget(container, actor, input),
    isOperator(container, actor),
  ]);
  const shop =
    target.steward && input.kind === "place"
      ? await loadPlaceFrame(container, actor, input.id)
      : null;
  const kindLabel = input.kind === "place" ? "店舗" : "";
  return {
    kind: input.kind,
    id: input.id,
    name: target.name,
    state: target.steward
      ? target.state
      : [
          kindLabel,
          target.state,
          ...(target.vacant ? ["管理者のいない店舗"] : []),
        ]
          .filter((part) => part !== "")
          .join(" · "),
    steward: target.steward,
    operator,
    shop,
  };
}

/**
 * CM-02's lists: the managers (email, oldest first) and the pending
 * invitations, with what the viewer may do. `ForbiddenError` unless the
 * viewer manages the target or is an operator.
 */
export async function loadMemberBoard(
  input: MemberTargetInput,
): Promise<MemberBoardData> {
  const container = await getContainer();
  const actor = await requireActor(container);
  const [target, members, operator] = await Promise.all([
    readTarget(container, actor, input),
    viewMembers({
      container,
      actor,
      input: { target: StewardedRef.create(input.kind, input.id) },
    }),
    isOperator(container, actor),
  ]);
  return {
    kind: input.kind,
    id: input.id,
    name: target.name,
    vacant: members.vacant,
    stewards: members.stewards.map((member) => ({
      accountId: member.accountId,
      email: member.email,
      isSelf: member.isSelf,
    })),
    invitations: members.invitations.map((invitation) => ({
      invitationId: invitation.invitationId,
      email: invitation.email,
      invitedAt: invitation.invitedAt.toISOString(),
    })),
    steward: members.stewards.some((member) => member.isSelf),
    operator,
  };
}
