import { describePhotoInspectorContract } from "@repo/core/adapters/shared/__conformance__/photoInspector";
import { StructuralPhotoInspector } from "@repo/core/adapters/shared/structuralPhotoInspector";

// The production inspector inside the Workers runtime.
describePhotoInspectorContract(() => new StructuralPhotoInspector());
