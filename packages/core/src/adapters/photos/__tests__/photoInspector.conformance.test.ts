import { describePhotoInspectorContract } from "../__conformance__/photoInspector";
import { StructuralPhotoInspector } from "../structuralPhotoInspector";

// The production inspector is pure TypeScript, so the Node run is the real
// one; the same suite also runs in the Workers pool.
describePhotoInspectorContract(() => new StructuralPhotoInspector());
