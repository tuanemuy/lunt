// @vitest-environment happy-dom
import { act, cleanup, render } from "@testing-library/react";
import { useState } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { HydrationGate } from "../HydrationGate";

function NameForm() {
  const [name, setName] = useState("喫茶ひだまり");
  return (
    <form>
      <HydrationGate>
        <input
          aria-label="店舗名"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </HydrationGate>
    </form>
  );
}

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

describe("HydrationGate", () => {
  it("serves the form's controls disabled, so nothing can be typed before the island hydrates", () => {
    const container = document.createElement("div");
    container.innerHTML = renderToString(<NameForm />);
    const fieldset = container.querySelector("fieldset");
    expect(fieldset?.disabled).toBe(true);
    expect(fieldset?.getAttribute("aria-busy")).toBe("true");
  });

  it("opens the controls once the island has hydrated", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    container.innerHTML = renderToString(<NameForm />);
    const root = await act(async () => hydrateRoot(container, <NameForm />));
    const fieldset = container.querySelector("fieldset");
    expect(fieldset?.disabled).toBe(false);
    expect(fieldset?.hasAttribute("aria-busy")).toBe(false);
    act(() => root.unmount());
  });

  it("is open from the start when rendered on the client (a navigation)", () => {
    const { container } = render(<NameForm />);
    expect(container.querySelector("fieldset")?.disabled).toBe(false);
  });
});
