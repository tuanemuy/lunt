import { describeReferenceQueriesContract } from "@repo/core/adapters/do/__conformance__/referenceQueries";
import { createDiscoveryDoHarness } from "./discoveryDoHarness";

describeReferenceQueriesContract(createDiscoveryDoHarness);
