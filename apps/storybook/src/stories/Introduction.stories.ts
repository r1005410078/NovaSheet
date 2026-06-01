import type { Meta, StoryObj } from '@storybook/html'
import { docsMeta, docsStory } from '../story-docs'
import introSrc from './snippets/intro.snippet.ts?raw'

const meta: Meta = {
  title: 'Introduction',
  parameters: {
    layout: 'fullscreen',
  },
  ...docsMeta(
    'NovaSheet Storybook: use the **Table/** group for Grid demos. Open **README** for notes and TypeScript examples. Each story can show its source through **Show code**.',
  ),
}
export default meta

type Story = StoryObj

export const Welcome: Story = {
  name: 'Welcome',
  ...docsStory(
    introSrc,
    'Minimal Grid usage. Full examples live under the **Table/** story group.',
  ),
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
        Select a story under <strong>Table/</strong> to inspect a Grid demo. Open <strong>README</strong> in the same group for notes and code examples.
      </p>
      <h2 style="margin: 20px 0 6px; font-size: 16px;">Current capabilities</h2>
      <ul style="margin: 0 0 16px 20px; padding: 0; font-size: 13px;">
        <li><strong>M2</strong> — virtual scrolling with native scrollbars</li>
        <li><strong>M3</strong> — frozen regions, row-height autofit, and wrapped text</li>
        <li><strong>Phase 3+</strong> — selection, keyboard navigation, editing, resize, clipboard, undo/redo, fill handle, sort/filter, structural operations, merge cells, and range formatting</li>
      </ul>
      <p style="margin: 20px 0 0; color: #656d76; font-size: 12px;">
        Design docs: <code>docs/superpowers/specs/</code>
      </p>
    `
    return root
  },
}
