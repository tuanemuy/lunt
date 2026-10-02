import { describePhotoAssetRepositoryContract } from "@repo/core/adapters/durableObject/__conformance__/photoAssetRepository";
import { createDoHarness } from "./doHarness";

describePhotoAssetRepositoryContract(createDoHarness);
