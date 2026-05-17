import type { Preview } from '@storybook/html'

const preview: Preview = {
  parameters: {
    controls: { expanded: true },
    // 'fullscreen' 让 story 占满整个 Storybook iframe，不再上下左右留白。
    // 单个 story 想要小尺寸可在 meta 里覆盖 parameters.layout = 'centered'。
    layout: 'fullscreen',
  },
  decorators: [
    (story) => {
      const wrapper = document.createElement('div')
      // 全屏铺满 + 防滚动（Grid 自己有滚动条，外层不再额外滚）
      wrapper.style.position = 'absolute'
      wrapper.style.inset = '0'
      wrapper.style.boxSizing = 'border-box'
      wrapper.style.overflow = 'hidden'
      const result = story()
      // story() returns the inner Grid container (which absolutely positions canvas on it)
      wrapper.appendChild(result as Node)
      return wrapper
    },
  ],
}

export default preview
