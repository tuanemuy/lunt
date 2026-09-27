import { describeDetailQueriesContract } from "@repo/core/adapters/do/__conformance__/detailQueries";
import { createDiscoveryDoHarness } from "./discoveryDoHarness";

describeDetailQueriesContract(createDiscoveryDoHarness);
