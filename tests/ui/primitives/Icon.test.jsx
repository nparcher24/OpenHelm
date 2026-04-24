import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { Icon } from '../../../src/ui/primitives/Icon.jsx'

describe('Icon', () => {
  it('renders SVG with given size', () => {
    const { container } = render(<Icon name="anchor" size={32} />)
    const svg = container.querySelector('svg')
    expect(svg).toBeTruthy()
    expect(svg.getAttribute('width')).toBe('32')
    expect(svg.getAttribute('height')).toBe('32')
  })

  it('renders empty svg for unknown name', () => {
    const { container } = render(<Icon name="not_an_icon" />)
    const svg = container.querySelector('svg')
    expect(svg).toBeTruthy()
    expect(svg.children.length).toBe(0)
  })

  it('applies stroke and color props', () => {
    const { container } = render(<Icon name="plus" stroke={2.5} color="#FF0000" />)
    const svg = container.querySelector('svg')
    expect(svg.getAttribute('stroke')).toBe('#FF0000')
    expect(svg.getAttribute('stroke-width')).toBe('2.5')
  })
})
