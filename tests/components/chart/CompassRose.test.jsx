import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { CompassRose } from '../../../src/components/chart/CompassRose.jsx'

describe('CompassRose', () => {
  it('rotates the needle by heading when not heading-up', () => {
    const { container } = render(<CompassRose heading={90} headingUp={false}/>)
    const needleGroup = container.querySelectorAll('g')[1]
    expect(needleGroup.getAttribute('transform')).toContain('rotate(90')
  })

  it('keeps needle pointing up when heading-up', () => {
    const { container } = render(<CompassRose heading={90} headingUp/>)
    const needleGroup = container.querySelectorAll('g')[1]
    expect(needleGroup.getAttribute('transform')).toContain('rotate(0')
  })

  it('renders with default size 72', () => {
    const { container } = render(<CompassRose/>)
    const svg = container.querySelector('svg')
    expect(svg.getAttribute('width')).toBe('72')
    expect(svg.getAttribute('height')).toBe('72')
  })

  it('accepts a custom size', () => {
    const { container } = render(<CompassRose size={120}/>)
    const svg = container.querySelector('svg')
    expect(svg.getAttribute('width')).toBe('120')
  })
})
