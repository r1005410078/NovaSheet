import { describe, expect, it, mock } from 'bun:test'
import { act } from 'react'
import type { Grid } from '@novasheet/core'

import { renderStoryHost, unmountReactRoot } from '../react-test-helpers'
import { Registered } from './RichText.stories'

describe('RichText Storybook story', () => {
  it('wires built-in toolbar fill color action to the grid', async () => {
    const render = Registered.render
    expect(render).toBeDefined()

    const host = await renderStoryHost(() => render!({}, {} as never) as HTMLElement)
    const gridHost = host.querySelector<HTMLElement>('[data-rich-text-grid-host]') as
      | (HTMLElement & { __grid?: Grid })
      | null
    expect(gridHost?.__grid).toBeDefined()

    const grid = gridHost!.__grid!
    const originalSetFillColor = grid.setFillColor.bind(grid)
    const setFillColor = mock((...args: Parameters<Grid['setFillColor']>) =>
      originalSetFillColor(...args),
    )
    grid.setFillColor = setFillColor

    const fillButton = host.querySelector<HTMLButtonElement>('[data-action-id="fill-color"]')
    expect(fillButton).not.toBeNull()
    await act(async () => { fillButton!.click() })

    const redSwatch = document.body.querySelector<HTMLButtonElement>('[data-fill-color="#ea4335"]')
    expect(redSwatch).not.toBeNull()
    await act(async () => { redSwatch!.click() })

    expect(setFillColor).toHaveBeenCalledWith(
      { startRow: 0, endRow: 0, startCol: 0, endCol: 0 },
      '#ea4335',
    )

    unmountReactRoot((host as unknown as { __root: { unmount(): void } }).__root)
    host.remove()
  })
})
