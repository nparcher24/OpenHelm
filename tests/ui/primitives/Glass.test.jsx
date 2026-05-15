import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { Glass } from '../../../src/ui/primitives/Glass.jsx'

describe('Glass', () => {
  it('renders children', () => {
    const { getByText } = render(<Glass>hello</Glass>)
    expect(getByText('hello')).toBeInTheDocument()
  })
  it('applies custom radius', () => {
    const { container } = render(<Glass radius={20}>x</Glass>)
    expect(container.firstChild.style.borderRadius).toBe('20px')
  })
  it('applies custom padding', () => {
    const { container } = render(<Glass pad={12}>x</Glass>)
    expect(container.firstChild.style.padding).toBe('12px')
  })
  it('merges style overrides', () => {
    const { container } = render(<Glass style={{ color: 'red' }}>x</Glass>)
    expect(container.firstChild.style.color).toBe('red')
  })
})
