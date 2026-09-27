/**
 * Every role — a permission not tied to a target. Callers that handle all
 * roles (withdrawal and its preview) iterate this list instead of naming
 * roles themselves.
 */
export const ROLES = ["editor", "operator"] as const;

export type Role = (typeof ROLES)[number];

export const Role = {
  all: ROLES,
  is: (raw: string): raw is Role => (ROLES as readonly string[]).includes(raw),
};
