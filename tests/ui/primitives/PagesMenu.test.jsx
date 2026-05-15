import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { PagesMenu } from '../../../src/ui/primitives/PagesMenu.jsx'

describe('PagesMenu', () => {
  it('renders all pages when open', () => {
    const { getByText } = render(
      <MemoryRouter>
        <PagesMenu open onClose={() => {}} />
      </MemoryRouter>
    )
    expect(getByText('Chart')).toBeInTheDocument()
    expect(getByText('GPS')).toBeInTheDocument()
    expect(getByText('Vessel')).toBeInTheDocument()
    expect(getByText('Settings')).toBeInTheDocument()
    expect(getByText('BlueTopo tiles')).toBeInTheDocument()
  })
  it('renders null when closed', () => {
    const { container } = render(
      <MemoryRouter>
        <PagesMenu open={false} onClose={() => {}} />
      </MemoryRouter>
    )
    expect(container.firstChild).toBeNull()
  })
})
