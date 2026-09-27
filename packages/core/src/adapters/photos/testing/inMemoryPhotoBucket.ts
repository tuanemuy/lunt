import { sha256Hex } from "@repo/core/domain/media/sha256";
import type { PhotoBucket, PhotoObject, PhotoObjectBody } from "../photoBucket";

type Stored = Readonly<{ bytes: Uint8Array; contentType: string }>;

const describe = (stored: Stored): PhotoObject => ({
  httpEtag: `"${sha256Hex(stored.bytes).slice(0, 32)}"`,
  size: stored.bytes.length,
  httpMetadata: { contentType: stored.contentType },
});

/**
 * `PhotoBucket` in memory, for Node tests: `R2PhotoStorage` over it is the
 * test implementation of `PhotoStorage`, and `servePhoto` serves from it.
 * Stored bytes are copied on the way in and out, as a real bucket would.
 */
export class InMemoryPhotoBucket implements PhotoBucket {
  private readonly objects = new Map<string, Stored>();

  async head(key: string): Promise<PhotoObject | null> {
    const stored = this.objects.get(key);
    return stored === undefined ? null : describe(stored);
  }

  async get(key: string): Promise<PhotoObjectBody | null> {
    const stored = this.objects.get(key);
    if (stored === undefined) return null;
    const bytes = stored.bytes.slice();
    return {
      ...describe(stored),
      body: new Blob([bytes]).stream(),
      arrayBuffer: async () => bytes.slice().buffer,
    };
  }

  async put(
    key: string,
    value: ArrayBuffer | Uint8Array,
    options: Readonly<{ httpMetadata: Readonly<{ contentType: string }> }>,
  ): Promise<unknown> {
    const bytes =
      value instanceof Uint8Array
        ? value.slice()
        : new Uint8Array(value.slice(0));
    this.objects.set(key, {
      bytes,
      contentType: options.httpMetadata.contentType,
    });
    return undefined;
  }

  async delete(key: string): Promise<void> {
    this.objects.delete(key);
  }

  /** Keys currently stored — for assertions that nothing was left behind. */
  keys(): readonly string[] {
    return [...this.objects.keys()];
  }
}
