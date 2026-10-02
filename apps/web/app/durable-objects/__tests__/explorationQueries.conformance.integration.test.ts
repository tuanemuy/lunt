import { describeExplorationQueriesContract } from "@repo/core/adapters/durableObject/__conformance__/explorationQueries";
import { createDiscoveryDoHarness } from "./discoveryDoHarness";

describeExplorationQueriesContract(createDiscoveryDoHarness);
