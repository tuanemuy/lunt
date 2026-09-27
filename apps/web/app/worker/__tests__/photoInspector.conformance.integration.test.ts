import { describePhotoInspectorContract } from "@repo/core/adapters/photos/__conformance__/photoInspector";
import { StructuralPhotoInspector } from "@repo/core/adapters/photos/structuralPhotoInspector";

// The production inspector inside the Workers runtime.
describePhotoInspectorContract(() => new StructuralPhotoInspector());
