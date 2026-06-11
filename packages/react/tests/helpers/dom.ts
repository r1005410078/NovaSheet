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

/** React 受控 input 需经 native setter 改值再派发 input 事件才能触发 onChange。 */
export function setInputValue(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  act(() => {
    if (setter) setter.call(input, value)
    else input.value = value
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
