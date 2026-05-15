import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { Toggle } from '../../../src/ui/primitives/Toggle.jsx'

describe('Toggle', () => {
  it('calls onChange with true when off', () => {
    const fn = vi.fn()
    const { getByRole } = render(<Toggle on={false} onChange={fn} />)
    fireEvent.click(getByRole('button'))
    expect(fn).toHaveBeenCalledWith(true)
  })
  it('calls onChange with false when on', () => {
    const fn = vi.fn()
    const { getByRole } = render(<Toggle on={true} onChange={fn} />)
    fireEvent.click(getByRole('button'))
    expect(fn).toHaveBeenCalledWith(false)
  })
})
