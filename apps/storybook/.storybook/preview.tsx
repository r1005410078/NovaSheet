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
      wrapper.style.overflow = 'hidden'
      const result = story()
      wrapper.appendChild(result as Node)
      return wrapper
    },
  ],
}

export default preview
