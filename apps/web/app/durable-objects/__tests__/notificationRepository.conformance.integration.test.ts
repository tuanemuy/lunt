import { describeNotificationRepositoryContract } from "@repo/core/adapters/durableObject/__conformance__/notificationRepository";
import { createDoHarness } from "./doHarness";

describeNotificationRepositoryContract(createDoHarness);
