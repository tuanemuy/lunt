import { describeNotificationMailRendererContract } from "@repo/core/application/notification/__conformance__/notificationMailRenderer";
import { notificationDestinationUrl } from "../notificationDestination";
import { createNotificationMailRenderer } from "../notificationMail";

const APP_URL = "https://lunt.example";

describeNotificationMailRendererContract("presentation", () => ({
  renderer: createNotificationMailRenderer({
    appUrl: APP_URL,
    siteName: "Lunt",
  }),
  urlOf: (destination) => notificationDestinationUrl(APP_URL, destination),
}));
