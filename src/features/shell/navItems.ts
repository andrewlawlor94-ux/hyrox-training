export interface NavItem {
  to: string
  label: string
  /** `NavLink`'s `end` — required for `/` so a future nested route under it
   * doesn't also mark Home active. */
  end?: boolean
}

/**
 * Data-driven so Plan is a one-line addition once that screen exists.
 * Progress joined Home/Settings once Tasks 25/26 shipped the Strength and
 * Running views behind it — before that, shipping the tab would have been
 * exactly the placeholder/dead-link pattern the Global Constraints forbid
 * (see the Task 18 report). Plan is still that screen-less tab, so it stays
 * out. Kept in its own module (rather than alongside `BottomNav`) so that
 * component file only exports a component, which is what
 * `react-refresh/only-export-components` wants for reliable fast refresh.
 */
export const NAV_ITEMS: readonly NavItem[] = [
  { to: '/', label: 'Home', end: true },
  { to: '/progress', label: 'Progress' },
  { to: '/settings', label: 'Settings' },
]
