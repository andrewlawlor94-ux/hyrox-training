import type { FC, ReactNode } from 'react'

type EmptyStateProps = {
  title: string
  description: string
  action?: ReactNode
}

/** Generic "nothing here yet" placeholder with an optional action slot. */
export const EmptyState: FC<EmptyStateProps> = ({ title, description, action }) => (
  <div className="empty-state">
    <p className="empty-state__title">{title}</p>
    <p className="empty-state__description">{description}</p>
    {action ? <div className="empty-state__action">{action}</div> : null}
  </div>
)
