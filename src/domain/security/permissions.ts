export type FmccRole = "owner" | "admin" | "analyst" | "viewer" | "member";
export type Permission =
  | "tenant:manage" | "member:manage"
  | "source:read" | "source:write"
  | "metric:read" | "audit:read"
  | "integration:read" | "integration:write"
  | "product:read" | "product:write"
  | "alert:read" | "alert:write"
  | "action:prepare";

const ROLE_PERMISSIONS: Record<FmccRole, ReadonlySet<Permission>> = {
  owner: new Set(["tenant:manage","member:manage","source:read","source:write","metric:read","audit:read","integration:read","integration:write","product:read","product:write","alert:read","alert:write","action:prepare"]),
  admin: new Set(["member:manage","source:read","source:write","metric:read","audit:read","integration:read","integration:write","product:read","product:write","alert:read","alert:write","action:prepare"]),
  analyst: new Set(["source:read","metric:read","audit:read","integration:read","product:read","alert:read","action:prepare"]),
  viewer: new Set(["metric:read","integration:read","product:read","alert:read"]),
  member: new Set(["metric:read","integration:read","product:read","alert:read"]),
};

export function normalizeRole(role: string): FmccRole {
  if (role === "owner" || role === "admin" || role === "analyst" || role === "viewer") return role;
  return "member";
}
export function roleHasPermission(role: FmccRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].has(permission);
}
