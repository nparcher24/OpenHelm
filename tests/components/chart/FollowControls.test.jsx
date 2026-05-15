import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { FollowControls } from '../../../src/components/chart/FollowControls.jsx'

describe('FollowControls', () => {
  it('toggles centerOn', () => {
    const set = vi.fn()
    const { getAllByRole } = render(
      <FollowControls centerOn={false} setCenterOn={set}
                      headingLock={false} setHeadingLock={() => {}}/>
    )
    fireEvent.click(getAllByRole('button')[0])
    expect(set).toHaveBeenCalledWith(true)
  })

  it('toggles headingLock', () => {
    const set = vi.fn()
    const { getAllByRole } = render(
      <FollowControls centerOn={false} setCenterOn={() => {}}
                      headingLock={false} setHeadingLock={set}/>
    )
    fireEvent.click(getAllByRole('button')[1])
    expect(set).toHaveBeenCalledWith(true)
  })

  it('shows "Locked" label when centerOn is true', () => {
    const { getByText } = render(
      <FollowControls centerOn={true} setCenterOn={() => {}}
                      headingLock={false} setHeadingLock={() => {}}/>
    )
    expect(getByText('Locked')).toBeTruthy()
  })

  it('shows "Heading-up" label when headingLock is true', () => {
    const { getByText } = render(
      <FollowControls centerOn={false} setCenterOn={() => {}}
                      headingLock={true} setHeadingLock={() => {}}/>
    )
    expect(getByText('Heading-up')).toBeTruthy()
  })
})
