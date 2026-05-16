import type { Preview } from '@storybook/html'

const preview: Preview = {
  parameters: {
    controls: { expanded: true },
    layout: 'centered',
  },
  decorators: [
    (story) => {
      const wrapper = document.createElement('div')
      wrapper.style.width = '800px'
      wrapper.style.height = '500px'
      wrapper.style.border = '1px solid #d0d7de'
      wrapper.style.boxSizing = 'border-box'
      const result = story()
      // story() returns the inner Grid container (which absolutely positions canvas on it)
      wrapper.appendChild(result as Node)
      return wrapper
    },
  ],
}

export default preview
