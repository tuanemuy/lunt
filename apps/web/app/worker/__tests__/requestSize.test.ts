import { describe, expect, it } from "vitest";
import { FORM_OVERHEAD_BYTES, refuseOversizedBody } from "../requestSize";

const MAX = 10 * 1024 * 1024;

function post(headers: Record<string, string>) {
  return new Request("http://localhost:3000/_serverFn/x", {
    method: "POST",
    headers,
  });
}

describe("refuseOversizedBody", () => {
  it("lets a body up to the photo limit plus the form envelope through", () => {
    expect(
      refuseOversizedBody(
        post({
          "content-type": "multipart/form-data; boundary=x",
          "content-length": String(MAX + FORM_OVERHEAD_BYTES),
        }),
        MAX,
      ),
    ).toBeNull();
    expect(
      refuseOversizedBody(new Request("http://localhost:3000/"), MAX),
    ).toBeNull();
  });

  it("refuses a larger body with 413 before it is read", () => {
    expect(
      refuseOversizedBody(
        post({ "content-length": String(MAX + FORM_OVERHEAD_BYTES + 1) }),
        MAX,
      )?.status,
    ).toBe(413);
  });

  it("requires a multipart body to declare its length", () => {
    expect(
      refuseOversizedBody(
        post({ "content-type": "multipart/form-data; boundary=x" }),
        MAX,
      )?.status,
    ).toBe(411);
    expect(refuseOversizedBody(post({}), MAX)).toBeNull();
    expect(
      refuseOversizedBody(post({ "content-length": "abc" }), MAX)?.status,
    ).toBe(400);
  });
});
