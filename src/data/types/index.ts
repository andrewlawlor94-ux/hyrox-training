// Barrel for every entity interface and union type in the data layer.
// Type-only re-exports — this module has zero runtime exports, which is what
// makes it safe for the domain layer to consume (via src/domain/types.ts)
// despite the ESLint rule blocking @/data/** imports from src/domain/**.
export type * from './primitives'
export type * from './enums'
export type * from './profile'
export type * from './exercise'
export type * from './plan'
export type * from './workout'
export type * from './logs'
export type * from './schedule'
export type * from './app'
