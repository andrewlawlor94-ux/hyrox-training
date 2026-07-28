// Shared id generation for every repository. A prefix keeps ids readable in
// devtools/exports (e.g. `set_3f2a...`) without encoding any meaning beyond
// "which table this row belongs to" — the UUID portion is what guarantees
// uniqueness, the prefix is purely diagnostic.
export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`
}
