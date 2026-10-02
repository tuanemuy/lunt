import { describeInfoReportRepositoryContract } from "@repo/core/adapters/durableObject/__conformance__/infoReportRepository";
import { createDoHarness } from "./doHarness";

describeInfoReportRepositoryContract(createDoHarness);
