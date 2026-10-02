import { describeArticleRepositoryContract } from "@repo/core/adapters/durableObject/__conformance__/articleRepository";
import { createDoHarness } from "./doHarness";

describeArticleRepositoryContract(createDoHarness);
