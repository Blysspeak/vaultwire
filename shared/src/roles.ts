import { z } from 'zod';

/** Роли выдаются на пространство целиком, прав на отдельные папки не бывает. */
export const ROLES = ['owner', 'rw', 'ro'] as const;

export const roleSchema = z.enum(ROLES);
export type Role = z.infer<typeof roleSchema>;

/** Право писать документы, тела и переезды. */
export function canWrite(role: Role): boolean {
  return role === 'owner' || role === 'rw';
}

/** Право управлять участниками и инвайтами. */
export function canAdmin(role: Role): boolean {
  return role === 'owner';
}
