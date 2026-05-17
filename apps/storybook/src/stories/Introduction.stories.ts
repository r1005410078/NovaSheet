import type { Meta, StoryObj } from '@storybook/html'

const meta: Meta = {
  title: 'Introduction',
  parameters: {
    layout: 'fullscreen',
  },
}
export default meta

type Story = StoryObj

/**
 * Plain HTML intro panel (no MDX). Explains current playground scope.
 */
export const Welcome: Story = {
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
      <h1 style="margin: 0 0 8px; font-size: 22px;">NovaSheet @novasheet/core playground</h1>
      <p style="margin: 0 0 16px; color: #656d76; font-size: 14px;">
        Stories below mount the vanilla TypeScript <code>Grid</code> class into a fixed-size container
        (800 x 500 by default). Pick a story from the sidebar to see a single static frame.
      </p>
      <h2 style="margin: 20px 0 6px; font-size: 16px;">Current scope: M1 Foundation</h2>
      <ul style="margin: 0 0 16px 20px; padding: 0; font-size: 13px;">
        <li>Single static frame; no scroll, no frozen rows/cols, no interaction.</li>
        <li>Renders the first ~17 rows that fit in the 500px tall host.</li>
        <li>Only <code>text</code> + <code>number</code> have dedicated CellPainter paths; others fall back to text.</li>
      </ul>
      <h2 style="margin: 20px 0 6px; font-size: 16px;">Coming later</h2>
      <ul style="margin: 0 0 16px 20px; padding: 0; font-size: 13px;">
        <li><strong>M2</strong> — virtualization &amp; native scroll</li>
        <li><strong>M3</strong> — frozen regions &amp; specialised cell painters</li>
        <li><strong>M4</strong> — interaction (resize / selection) &amp; React wrapper</li>
        <li><strong>M5</strong> — apps/playground &amp; AI surface</li>
      </ul>
      <p style="margin: 20px 0 0; color: #656d76; font-size: 12px;">
        See <code>docs/superpowers/specs/</code> and <code>CLAUDE.md</code> in the repo for the full design.
      </p>
    `
    return root
  },
}
