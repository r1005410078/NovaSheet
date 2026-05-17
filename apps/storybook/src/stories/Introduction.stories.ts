import type { Meta, StoryObj } from '@storybook/html'
import { docsMeta, docsStory } from '../story-docs'
import introSrc from './snippets/intro.snippet.ts?raw'

const meta: Meta = {
  title: '介绍',
  parameters: {
    layout: 'fullscreen',
  },
  ...docsMeta(
    'NovaSheet Storybook：左侧 **表格/** 分组为 Grid 演示；点 **README** 查看说明与 TypeScript 示例。每个 story 下方可展开 **Show code** 复制源码。',
  ),
}
export default meta

type Story = StoryObj

export const Welcome: Story = {
  name: '欢迎',
  ...docsStory(introSrc, '最小 Grid 用法；完整示例见各 **表格/** 分组 README。'),
  render: () => {
    const root = document.createElement('div')
    root.style.cssText = [
      'padding: 24px 28px',
      'font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      'color: #1f2328',
      'max-width: 720px',
      'line-height: 1.55',
    ].join(';')
    root.innerHTML = `
      <h1 style="margin: 0 0 8px; font-size: 22px;">NovaSheet Storybook</h1>
      <p style="margin: 0 0 16px; color: #656d76; font-size: 14px;">
        左侧选择 <strong>表格/</strong> 下的 story 查看 Grid；选择同组的 <strong>README</strong> 查看说明与代码示例。
      </p>
      <h2 style="margin: 20px 0 6px; font-size: 16px;">当前能力</h2>
      <ul style="margin: 0 0 16px 20px; padding: 0; font-size: 13px;">
        <li><strong>M2</strong> — 虚拟滚动、原生滚动条</li>
        <li><strong>M3</strong> — 顶 / 左 / 右冻结区域</li>
      </ul>
      <p style="margin: 20px 0 0; color: #656d76; font-size: 12px;">
        设计文档：<code>docs/superpowers/specs/</code>
      </p>
    `
    return root
  },
}
