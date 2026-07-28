export interface NavItem {
  to: string
  label: string
  /** `NavLink`'s `end` — required for `/` so a future nested route under it
   * doesn't also mark Home active. */
  end?: boolean
}

/**
 * Data-driven so Progress and Plan are a one-line addition once those
 * screens exist. Deliberate deviation from the brief's four destinations:
 * shipping a tab with no screen behind it would be exactly the
 * placeholder/dead-link pattern the Global Constraints forbid, so only
 * Home and Settings ship today — see the Task 18 report. Kept in its own
 * module (rather than alongside `BottomNav`) so that component file only
 * exports a component, which is what `react-refresh/only-export-components`
 * wants for reliable fast refresh.
 */
export const NAV_ITEMS: readonly NavItem[] = [
  { to: '/', label: 'Home', end: true },
  { to: '/settings', label: 'Settings' },
]
