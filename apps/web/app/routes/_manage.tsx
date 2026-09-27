import { createFileRoute, Outlet } from "@tanstack/react-router";
import { requireLogin } from "@/presentation/session";

/**
 * The management screens (SM・RM・EM・OM・CM・AM): all need a login
 * (CS-04). Each area's layout below draws its own shell and checks its
 * own authority (CS-05).
 */
export const Route = createFileRoute("/_manage")({
  beforeLoad: ({ location }) => requireLogin(location),
  component: Outlet,
});
