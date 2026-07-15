import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'

const reactStoryHostSelector = '[data-novasheet-react-root]'

export type ReactStoryHost = HTMLElement & {
  __reactRoot: Root
}

export function createReactStoryHost(): ReactStoryHost {
  // property 在此函数内创建、赋值，unknown bridge 只用于受控 DOM 扩展属性。
  const host = document.createElement('div') as unknown as ReactStoryHost
  host.dataset.novasheetReactRoot = ''
  host.__reactRoot = createRoot(host)
  return host
}

export function unmountReactStoryHosts(canvasElement: HTMLElement): void {
  for (const host of canvasElement.querySelectorAll<ReactStoryHost>(reactStoryHostSelector)) {
    host.__reactRoot.unmount()
  }
}
