import { act } from 'react'

/** Run a story `render()` and flush passive effects inside act(). */
export async function renderStoryHost(render: () => HTMLElement): Promise<HTMLElement> {
  let host!: HTMLElement
  await act(async () => {
    host = render()
    await Promise.resolve()
  })
  return host
}

export function unmountReactRoot(root: { unmount(): void }): void {
  act(() => {
    root.unmount()
  })
}
