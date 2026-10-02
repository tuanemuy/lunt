/**
 * Structural subset of the Workers `R2Bucket` API that photo storage and
 * delivery use. Declared locally, like `adapters/durableObject/sql.ts`, so the
 * adapters stay free of platform type imports: the Worker passes its
 * `env.PHOTOS` binding straight in, and Node tests pass
 * `InMemoryPhotoBucket`.
 */
export type PhotoObject = Readonly<{
  /** The quoted entity tag to send as `ETag`. */
  httpEtag: string;
  size: number;
  httpMetadata?: Readonly<{ contentType?: string }> | undefined;
}>;

export type PhotoObjectBody = PhotoObject &
  Readonly<{
    body: ReadableStream;
    arrayBuffer(): Promise<ArrayBuffer>;
  }>;

export interface PhotoBucket {
  head(key: string): Promise<PhotoObject | null>;
  get(key: string): Promise<PhotoObjectBody | null>;
  put(
    key: string,
    value: ArrayBuffer | Uint8Array,
    options: Readonly<{ httpMetadata: Readonly<{ contentType: string }> }>,
  ): Promise<unknown>;
  delete(key: string): Promise<void>;
}

/** Object key of a photo's content (design.md D-09). */
export const photoObjectKey = (photoId: string): string => `photos/${photoId}`;
