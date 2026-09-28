/** Room for the multipart envelope and the other form fields of an upload. */
export const FORM_OVERHEAD_BYTES = 64 * 1024;

/**
 * Refuses a request body larger than the largest photo (plus the form's
 * envelope) before the framework reads it into memory — a server
 * function's validator only runs after the whole body is parsed. A
 * multipart body must declare its length; every browser form does.
 * `null` means the request may go on.
 */
export function refuseOversizedBody(
  request: Request,
  maxPhotoBytes: number,
): Response | null {
  if (request.method === "GET" || request.method === "HEAD") return null;
  const declared = request.headers.get("content-length");
  const multipart = (request.headers.get("content-type") ?? "").startsWith(
    "multipart/form-data",
  );
  if (declared === null) {
    return multipart ? new Response("Length Required", { status: 411 }) : null;
  }
  const length = Number(declared);
  if (!Number.isFinite(length) || length < 0) {
    return new Response("Bad Request", { status: 400 });
  }
  return length > maxPhotoBytes + FORM_OVERHEAD_BYTES
    ? new Response("Payload Too Large", { status: 413 })
    : null;
}
