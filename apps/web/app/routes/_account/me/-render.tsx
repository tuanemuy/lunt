import { createServerFn } from "@tanstack/react-start";
import { renderServerComponent } from "@tanstack/react-start/rsc";
import { errorResponseMiddleware } from "@/presentation/errorResponseMiddleware";

/**
 * MY-01's body as an RSC payload, returned unresolved so the loader can
 * forward it and the body streams in under the skeleton.
 */
export const renderMyPage = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .handler(async () => {
    const { MyPageContent } = await import(
      "@/components/account/MyPageContent"
    );
    return { MyPage: renderServerComponent(<MyPageContent />) };
  });

/** MY-03's list as an RSC payload (see `renderMyPage`). */
export const renderNotifications = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .handler(async () => {
    const { NotificationsContent } = await import(
      "@/components/account/NotificationsContent"
    );
    return {
      Notifications: renderServerComponent(<NotificationsContent />),
    };
  });

/** MY-07's body as an RSC payload (see `renderMyPage`). */
export const renderWithdrawal = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .handler(async () => {
    const { WithdrawalContent } = await import(
      "@/components/account/WithdrawalContent"
    );
    return { Withdrawal: renderServerComponent(<WithdrawalContent />) };
  });
