/** ISO calendar date, 'YYYY-MM-DD'. Never a timestamp. */
export type ISODate = string

/** ISO 8601 instant with timezone, e.g. '2026-07-27T14:03:00.000Z'. */
export type ISOInstant = string

/** Unit of measure for a load entered by the athlete. */
export type Unit = 'lb' | 'kg' | 'custom'

/**
 * A JSON-serializable value. Used for derived/append-only bags (milestone
 * evidence, backup payloads) that must round-trip through backup export and
 * import without losing shape.
 */
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }

/** A weight/load value paired with its unit. */
export interface Load {
  value: number
  unit: Unit
  customUnitLabel?: string
}
