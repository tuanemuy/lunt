import { createCsrfMiddleware, createStart } from "@tanstack/react-start";
import { appServerErrorAdapter } from "@/presentation/appServerErrorAdapter";

// Server functions are the only state-changing entry points. Refusing
// cross-site calls to them complements the session cookie's
// `SameSite=Lax` (design.md D-06), which already withholds the cookie
// from cross-site POSTs.
const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
});

export const startInstance = createStart(() => ({
  requestMiddleware: [csrfMiddleware],
  serializationAdapters: [appServerErrorAdapter],
}));
