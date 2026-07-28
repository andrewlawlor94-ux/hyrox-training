import { STORES_V1 } from '../schema'

/** Initial schema. Every future version gets its own file like this one,
 * appended to MIGRATIONS in migrations/index.ts — v1 itself is never edited
 * again once shipped, so already-upgraded athlete databases stay stable. */
export const v1 = {
  version: 1,
  stores: STORES_V1,
} as const
