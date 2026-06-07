import { describe, expect, it } from 'bun:test'

import { BasicReactGrid } from './React.stories'

describe('React Storybook stories', () => {
  it('renders the React package grid story into an HTML host', async () => {
    const render = BasicReactGrid.render
    expect(render).toBeDefined()

    const host = render!({}, {} as never) as HTMLElement

    expect(host.querySelector('[data-novasheet-react-grid]')).not.toBeNull()
    expect(host.querySelector('[role="toolbar"]')).not.toBeNull()
    expect(host.querySelector('canvas')).not.toBeNull()

    ;(host as unknown as { __reactRoot: { unmount(): void } }).__reactRoot.unmount()
  })

  it('wires toolbar clicks to the mounted Grid facade', async () => {
    const render = BasicReactGrid.render
    expect(render).toBeDefined()

    const host = render!({}, {} as never) as HTMLElement
    await Promise.resolve()

    const fillButton = host.querySelector<HTMLButtonElement>('[data-action-id="fill-color"]')
    const undoButton = host.querySelector<HTMLButtonElement>('[data-action-id="undo"]')

    expect(fillButton).not.toBeNull()
    expect(undoButton?.disabled).toBe(true)
    expect(host.querySelector('[data-novasheet-react-toolbar-status]')).toBeNull()

    fillButton!.click()
    await Promise.resolve()

    const redSwatch = document.body.querySelector<HTMLButtonElement>('[data-fill-color="#ea4335"]')
    expect(redSwatch).not.toBeNull()

    redSwatch!.click()
    await Promise.resolve()

    expect(undoButton?.disabled).toBe(false)

    ;(host as unknown as { __reactRoot: { unmount(): void } }).__reactRoot.unmount()
  })
})
