import { describeNotificationRepositoryContract } from "@repo/core/adapters/do/__conformance__/notificationRepository";
import { createDoHarness } from "./doHarness";

describeNotificationRepositoryContract(createDoHarness);
