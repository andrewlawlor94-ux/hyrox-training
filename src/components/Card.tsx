import type { FC, ReactNode } from 'react'

type CardTag = 'div' | 'section' | 'article'

type CardProps = {
  children: ReactNode
  className?: string
  as?: CardTag
}

/** Simple bordered surface. No domain knowledge — pure presentation. */
export const Card: FC<CardProps> = ({ children, className, as: Tag = 'div' }) => {
  const classes = className ? `card ${className}` : 'card'
  return <Tag className={classes}>{children}</Tag>
}
