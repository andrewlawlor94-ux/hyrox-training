// Re-export barrel so the domain layer can use entity types without importing
// from @/data/* (blocked by the purity ESLint rule). Types only, no runtime code.
export type * from '@/data/types'
