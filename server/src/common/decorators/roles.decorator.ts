import { SetMetadata } from '@nestjs/common';

/**
 * Roles recognised by the RBAC layer. `super` bypasses the per-action
 * permission checks; `admin` is the standard back-office role.
 */
export type Role = 'user' | 'admin' | 'super';

export const ROLES_KEY = 'roles';

/**
 * Declare which roles may invoke a controller method. Enforced by
 * RolesGuard when registered globally (see main.ts).
 *
 * Example: `@Roles('admin', 'super')`
 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
