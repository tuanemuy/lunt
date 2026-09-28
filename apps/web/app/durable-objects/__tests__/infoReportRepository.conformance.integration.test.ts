import { describeInfoReportRepositoryContract } from "@repo/core/adapters/do/__conformance__/infoReportRepository";
import { createDoHarness } from "./doHarness";

describeInfoReportRepositoryContract(createDoHarness);
