import { describeArticleRepositoryContract } from "@repo/core/adapters/do/__conformance__/articleRepository";
import { createDoHarness } from "./doHarness";

describeArticleRepositoryContract(createDoHarness);
