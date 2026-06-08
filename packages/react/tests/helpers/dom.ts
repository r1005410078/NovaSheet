import type { ReactElement } from 'react'
import { act } from 'react'
import { flushSync } from 'react-dom'
import type { Root } from 'react-dom/client'

export async function mountReactRoot(root: Root, element: ReactElement): Promise<void> {
  await act(async () => {
    flushSync(() => {
      root.render(element)
    })
    await Promise.resolve()
  })
}

export function unmountReactRoot(root: Root): void {
  act(() => {
    flushSync(() => {
      root.unmount()
    })
  })
}

export function clickElement(element: HTMLElement): void {
  act(() => {
    element.click()
  })
}

/** Popover menus portal to document.body — click with act(). */
export function clickBody(selector: string): void {
  const element = document.body.querySelector<HTMLElement>(selector)
  if (!element) throw new Error(`element not found in document.body: ${selector}`)
  clickElement(element)
}

/** Flush passive effects (useEffect) and microtasks after mount or interaction. */
export async function flushReactEffects(): Promise<void> {
  await act(async () => {
    await Promise.resolve()
  })
}
