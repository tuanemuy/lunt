import { describePhotoAssetRepositoryContract } from "@repo/core/adapters/do/__conformance__/photoAssetRepository";
import { createDoHarness } from "./doHarness";

describePhotoAssetRepositoryContract(createDoHarness);
