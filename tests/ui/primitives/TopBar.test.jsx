import { describe, it, expect } from 'vitest'
import { render, fireEvent, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ThemeProvider } from '../../../src/ui/theme/ThemeProvider.jsx'
import { TopBar } from '../../../src/ui/primitives/TopBar.jsx'

function wrap(ui) {
  return render(<MemoryRouter><ThemeProvider>{ui}</ThemeProvider></MemoryRouter>)
}

describe('TopBar', () => {
  it('renders title', () => {
    wrap(<TopBar title="GPS"/>)
    expect(screen.getByText('GPS')).toBeInTheDocument()
  })
  it('opens pages menu when hamburger clicked', () => {
    wrap(<TopBar title="GPS"/>)
    expect(screen.queryByText('Chart')).toBeNull()
    // Hamburger is the first button in the bar.
    const buttons = screen.getAllByRole('button')
    fireEvent.click(buttons[0])
    expect(screen.getByText('Chart')).toBeInTheDocument()
  })
  it('renders right slot content', () => {
    wrap(<TopBar title="X" right={<span data-testid="right-slot">RIGHT</span>}/>)
    expect(screen.getByTestId('right-slot')).toBeInTheDocument()
  })
})
