import { describe, expect, it } from 'bun:test'

import { renderStoryHost, unmountReactRoot } from '../react-test-helpers'
import { BasicReactGrid } from './React.stories'

describe('React Storybook stories', () => {
  it('renders the React package grid story into an HTML host', async () => {
    const render = BasicReactGrid.render
    expect(render).toBeDefined()

    const host = await renderStoryHost(() => render!({}, {} as never) as HTMLElement)

    expect(host.querySelector('[data-novasheet-react-grid]')).not.toBeNull()
    expect(host.querySelector('[role="toolbar"]')).not.toBeNull()
    expect(host.querySelector('canvas')).not.toBeNull()

    unmountReactRoot((host as unknown as { __reactRoot: { unmount(): void } }).__reactRoot)
  })
})
