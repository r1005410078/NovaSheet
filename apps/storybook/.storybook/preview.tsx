import type { Preview } from '@storybook/html'
import { DocsPage } from '@storybook/addon-docs/blocks'

const preview: Preview = {
  tags: ['autodocs'],
  parameters: {
    controls: { expanded: true },
    layout: 'fullscreen',
    docs: {
      page: DocsPage,
      canvas: {
        sourceState: 'shown',
      },
    },
  },
  decorators: [
    (story) => {
      const wrapper = document.createElement('div')
      wrapper.style.position = 'absolute'
      wrapper.style.inset = '0'
      wrapper.style.boxSizing = 'border-box'
      wrapper.style.padding = '16px'
      wrapper.style.overflow = 'hidden'
      wrapper.style.display = 'flex'
      wrapper.style.flexDirection = 'column'
      const result = story()
      if (result instanceof HTMLElement) {
        result.style.flex = '1 1 auto'
        result.style.minHeight = '0'
        result.style.width = '100%'
        if (!result.style.height) result.style.height = '100%'
      }
      wrapper.appendChild(result as Node)
      return wrapper
    },
  ],
}

export default preview
