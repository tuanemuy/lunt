import { describeDetailQueriesContract } from "@repo/core/adapters/durableObject/__conformance__/detailQueries";
import { createDiscoveryDoHarness } from "./discoveryDoHarness";

describeDetailQueriesContract(createDiscoveryDoHarness);
