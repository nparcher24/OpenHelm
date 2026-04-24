import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { Readout } from '../../../src/ui/primitives/Readout.jsx'

describe('Readout', () => {
  it('renders label, value, unit', () => {
    const { getByText } = render(<Readout label="Speed" value="6.2" unit="kn" />)
    expect(getByText('Speed')).toBeInTheDocument()
    expect(getByText('6.2')).toBeInTheDocument()
    expect(getByText('kn')).toBeInTheDocument()
  })

  it('renders without label when omitted', () => {
    const { container } = render(<Readout value="12.3" unit="ft" />)
    expect(container.textContent).toContain('12.3')
    expect(container.textContent).toContain('ft')
  })

  it('renders sub line when provided', () => {
    const { getByText } = render(<Readout value="1" unit="x" sub="since 12:00" />)
    expect(getByText('since 12:00')).toBeInTheDocument()
  })
})
