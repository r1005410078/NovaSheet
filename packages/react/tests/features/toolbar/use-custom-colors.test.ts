import { beforeEach, describe, expect, it } from 'bun:test'
import React from 'react'
import { createRoot } from 'react-dom/client'

import { useCustomColors } from '../../../src/features/toolbar/lib/use-custom-colors'
import { clickElement, mountReactRoot, unmountReactRoot } from '../../helpers/dom'

function HookProbe({ color }: { readonly color: string }): JSX.Element {
  const { colors, add } = useCustomColors()
  return React.createElement(
    'div',
    null,
    React.createElement('button', { 'data-add': '', onClick: () => add(color) }),
    React.createElement('span', { 'data-colors': colors.join(',') }),
  )
}

async function mountProbe(color: string) {
  const container = document.createElement('div')
  const root = createRoot(container)
  await mountReactRoot(root, React.createElement(HookProbe, { color }))
  return {
    container,
    colorsAttr: () => container.querySelector('span')!.getAttribute('data-colors'),
    addClick: () => clickElement(container.querySelector('button')!),
    unmount: () => unmountReactRoot(root),
  }
}

describe('useCustomColors', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('add 后规范化存入并持久化到 localStorage', async () => {
    const probe = await mountProbe('#FF000080')
    probe.addClick()
    expect(probe.colorsAttr()).toBe('#ff000080')
    expect(localStorage.getItem('novasheet:custom-colors')).toBe('["#ff000080"]')
    probe.unmount()
  })

  it('重挂载读取已存颜色', async () => {
    localStorage.setItem('novasheet:custom-colors', '["#00ff0080","#fff2cc"]')
    const probe = await mountProbe('#000000')
    expect(probe.colorsAttr()).toBe('#00ff0080,#fff2cc')
    probe.unmount()
  })

  it('去重：重复 add 移到队首不重复', async () => {
    localStorage.setItem('novasheet:custom-colors', '["#fff2cc","#ff000080"]')
    const probe = await mountProbe('#FF000080')
    probe.addClick()
    expect(probe.colorsAttr()).toBe('#ff000080,#fff2cc')
    probe.unmount()
  })

  it('FIFO 上限 16', async () => {
    const seed = Array.from({ length: 16 }, (_, i) => `#0000${i.toString(16).padStart(2, '0')}`)
    localStorage.setItem('novasheet:custom-colors', JSON.stringify(seed))
    const probe = await mountProbe('#ff0000')
    probe.addClick()
    const colors = probe.colorsAttr()!.split(',')
    expect(colors).toHaveLength(16)
    expect(colors[0]).toBe('#ff0000')
    expect(colors).not.toContain('#00000f')
    probe.unmount()
  })

  it('localStorage 损坏 JSON 时回退空列表不抛错', async () => {
    localStorage.setItem('novasheet:custom-colors', '{not json')
    const probe = await mountProbe('#ff0000')
    expect(probe.colorsAttr()).toBe('')
    probe.addClick()
    expect(probe.colorsAttr()).toBe('#ff0000')
    probe.unmount()
  })
})
