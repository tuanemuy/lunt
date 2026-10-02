import { describeReferenceQueriesContract } from "@repo/core/adapters/durableObject/__conformance__/referenceQueries";
import { createDiscoveryDoHarness } from "./discoveryDoHarness";

describeReferenceQueriesContract(createDiscoveryDoHarness);
