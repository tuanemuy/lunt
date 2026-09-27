import { describeNotificationMailRendererContract } from "../__conformance__/notificationMailRenderer";
import {
  TestNotificationMailRenderer,
  testDestinationUrl,
} from "./testServices";

// The usecase tests' fake keeps the port's contract too. The presentation
// renderer runs the same suite from `apps/web/app/presentation/__tests__`.
describeNotificationMailRendererContract("test renderer", () => ({
  renderer: new TestNotificationMailRenderer(),
  urlOf: testDestinationUrl,
}));
