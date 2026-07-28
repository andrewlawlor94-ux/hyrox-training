import type { FC } from 'react'
import { NavLink } from 'react-router-dom'
import { NAV_ITEMS } from './navItems'

function linkClassName({ isActive }: { isActive: boolean }): string {
  return isActive ? 'bottom-nav__link bottom-nav__link--active' : 'bottom-nav__link'
}

/**
 * Fixed bottom navigation. Text labels always accompany every destination —
 * never icon-only — and `aria-current="page"` comes from `NavLink` itself,
 * which sets it automatically on the active link.
 */
export const BottomNav: FC = () => (
  <nav className="bottom-nav" aria-label="Primary">
    <ul className="bottom-nav__list">
      {NAV_ITEMS.map((item) => (
        <li key={item.to} className="bottom-nav__item">
          <NavLink to={item.to} end={item.end ?? false} className={linkClassName}>
            <span className="bottom-nav__label">{item.label}</span>
          </NavLink>
        </li>
      ))}
    </ul>
  </nav>
)
