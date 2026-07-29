export interface NavItem {
  to: string
  label: string
  /** `NavLink`'s `end` — required for `/` so a future nested route under it
   * doesn't also mark Home active. */
  end?: boolean
}

/**
 * Data-driven so a new tab is a one-line addition once its screen exists.
 * Progress joined Home/Settings once Tasks 25/26 shipped the Strength and
 * Running views behind it; Plan joined once Task 27 shipped the week
 * browser (`PlanScreen`) — before each, shipping the tab would have been
 * exactly the placeholder/dead-link pattern the Global Constraints forbid
 * (see the Task 18 report). This completes the brief's four bottom-nav
 * destinations: Home / Progress / Plan / Settings. Kept in its own module
 * (rather than alongside `BottomNav`) so that component file only exports a
 * component, which is what `react-refresh/only-export-components` wants for
 * reliable fast refresh.
 */
export const NAV_ITEMS: readonly NavItem[] = [
  { to: '/', label: 'Home', end: true },
  { to: '/progress', label: 'Progress' },
  { to: '/plan', label: 'Plan' },
  { to: '/settings', label: 'Settings' },
]
