import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { Button } from './Button'

type ErrorBoundaryProps = {
  children: ReactNode
  fallbackTitle?: string
}

type ErrorBoundaryState = {
  error: Error | null
}

const DEFAULT_FALLBACK_TITLE = 'Something went wrong'

/** Class component: componentDidCatch is the only way to catch render errors in React. */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // Logged for local debugging only — this app has no remote error reporting.
    console.error('ErrorBoundary caught an error', error, info)
  }

  private handleReload = (): void => {
    window.location.reload()
  }

  override render(): ReactNode {
    const { error } = this.state
    const { children, fallbackTitle = DEFAULT_FALLBACK_TITLE } = this.props

    if (!error) return children

    return (
      <div className="error-boundary">
        <p className="error-boundary__title">{fallbackTitle}</p>
        <p className="error-boundary__message">{error.message}</p>
        <Button onClick={this.handleReload}>Reload</Button>
      </div>
    )
  }
}
