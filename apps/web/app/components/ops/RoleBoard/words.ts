import type { Role } from "@repo/core/domain/authority/role";

/** OM-07's wording per role: editors are appointed, operators granted. */
export const ROLE_WORDS = {
  editor: {
    name: "編集担当者",
    grantLabel: "編集担当者に任命する",
    grant: "任命する",
    granting: "任命しています…",
    grantFailed: "任命できませんでした",
    grantFailedBody:
      "通信を確かめて、もう一度任命してください。入力したメールアドレスは残っています。",
    grantHelp:
      "既存のアカウントのメールアドレスを入力します。自分自身も任命できます。",
    noAccount:
      "このメールアドレスのアカウントはありません。Lunt にアカウントを作った人だけを任命できます。",
    granted: (email: string) => `${email} を編集担当者に任命しました`,
    grantedBody: "この利用者は、いまから読みもの編集を行えます。",
    grantedBadge: "任命しました",
    revoke: "任命を解く",
    revokeFailed: "任命を解けませんでした",
    revoked: (email: string) => `${email} の任命を解きました`,
    revokedBody: "この利用者は、読みもの編集を行えなくなりました。",
  },
  operator: {
    name: "サービス運営者",
    grantLabel: "サービス運営者の役割を付与する",
    grant: "付与する",
    granting: "付与しています…",
    grantFailed: "付与できませんでした",
    grantFailedBody:
      "通信を確かめて、もう一度付与してください。入力したメールアドレスは残っています。",
    grantHelp: "既存のアカウントのメールアドレスを入力します。",
    noAccount:
      "このメールアドレスのアカウントはありません。Lunt にアカウントを作った人だけに付与できます。",
    granted: (email: string) => `${email} にサービス運営者の役割を付与しました`,
    grantedBody: "この利用者は、いまからサービス運営を行えます。",
    grantedBadge: "付与しました",
    revoke: "解除する",
    revokeFailed: "解除できませんでした",
    revoked: (email: string) => `${email} のサービス運営者の役割を解除しました`,
    revokedBody: "この利用者は、サービス運営を行えなくなりました。",
  },
} as const satisfies Record<Role, unknown>;
