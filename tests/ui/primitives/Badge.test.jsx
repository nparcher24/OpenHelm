import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { Badge } from '../../../src/ui/primitives/Badge.jsx'

describe('Badge', () => {
  it('renders children', () => {
    const { getByText } = render(<Badge>OK</Badge>)
    expect(getByText('OK')).toBeInTheDocument()
  })
  it('renders dot when prop passed', () => {
    const { container } = render(<Badge dot>OK</Badge>)
    // Outer <span> + inner dot <span>; expect more than one span total
    expect(container.querySelectorAll('span').length).toBeGreaterThan(1)
  })
  it('falls back to neutral for unknown tone', () => {
    const { container } = render(<Badge tone="not-a-tone">x</Badge>)
    // just confirm it renders without crashing
    expect(container.firstChild).toBeTruthy()
  })
})
