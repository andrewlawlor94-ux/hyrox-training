import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ErrorBoundary } from '@/components'

function Bomb({ message }: { message: string }): never {
  throw new Error(message)
}

describe('ErrorBoundary', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    // React logs the caught error to console.error itself (in addition to our
    // componentDidCatch logging), and jsdom logs an "uncaught error" style
    // message for the render-phase throw. Both are expected noise for these
    // tests specifically — spy-and-suppress here only, not globally, so an
    // unexpected console.error anywhere else in the suite still surfaces.
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleErrorSpy.mockRestore()
  })

  it('renders children normally when nothing throws', () => {
    render(
      <ErrorBoundary>
        <p>All good</p>
      </ErrorBoundary>,
    )
    expect(screen.getByText('All good')).toBeInTheDocument()
    expect(consoleErrorSpy).not.toHaveBeenCalled()
  })

  it('renders the fallback with the caught message and fallbackTitle when a child throws', () => {
    render(
      <ErrorBoundary fallbackTitle="Screen crashed">
        <Bomb message="boom details" />
      </ErrorBoundary>,
    )
    expect(screen.getByText('Screen crashed')).toBeInTheDocument()
    expect(screen.getByText('boom details')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument()
  })

  it('falls back to the default title when fallbackTitle is not supplied', () => {
    render(
      <ErrorBoundary>
        <Bomb message="boom" />
      </ErrorBoundary>,
    )
    expect(screen.getByText('Something went wrong')).toBeInTheDocument()
  })
})
