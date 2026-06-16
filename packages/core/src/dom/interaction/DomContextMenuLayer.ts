/**
 * Phase 4.0 — DOM 右键菜单层（生命周期 + themed CSS）。
 *
 * **Portal 模式**：layer 挂在 `document.body`（不是 grid container），CSS 变量直接
 * 写在 layer 上。原因——`position: fixed` 一旦遇到祖先有 `transform / filter / perspective /
 * will-change / contain`，containing block 会变成那个祖先而非视口；Storybook 等宿主框架
 * 经常引入这类祖先（iframe 包装、动效层），导致菜单错位甚至看不见。挂 body 直接绕开。
 *
 * 多 Grid：每个实例创建独立 layer，destroy 时各自从 body 移除（spec §6.5 #2）。
 */

import type {
  BuiltInMenuIconName,
  ContextMenuAction,
  ContextMenuItem,
  MenuIcon,
} from '../../features/context-menu/ContextMenuModel'
import type { Theme } from '../../kernel/theme/Theme'
import { applyContextMenuTheme, ensureContextMenuStylesheet } from '../host/context-menu-style'

/** builtin icon name → glyph 字符映射（CSS 可通过 data-ns-menu-icon attr 覆盖） */
const BUILTIN_ICON_GLYPHS: Record<BuiltInMenuIconName, string> = {
  cut: '✂',
  copy: '⎘',
  paste: '⊕',
  plus: '+',
  trash: '⌫',
  clear: '✕',
  hide: '◫',
  resize: '↔',
  filter: '⊟',
  sortAsc: '↑',
  sortDesc: '↓',
  more: '⋯',
}

export interface DomContextMenuLayerCallbacks {
  onSelect: (id: ContextMenuAction | string) => void
  /** 菜单关闭时若焦点确实在菜单内，回调以恢复 grid 焦点（spec §4.5）。 */
  onClose?: () => void
}

export interface OpenContextMenuOptions {
  clientX: number
  clientY: number
  items: readonly ContextMenuItem[]
}

export class DomContextMenuLayer {
  private container: HTMLElement
  private callbacks: DomContextMenuLayerCallbacks
  private layer!: HTMLElement
  private menu!: HTMLElement
  private attached = false
  private destroyed = false
  private opened = false
  private currentSubmenu: HTMLElement | null = null

  constructor(container: HTMLElement, callbacks: DomContextMenuLayerCallbacks) {
    this.container = container
    this.callbacks = callbacks
  }

  attach(): void {
    if (this.attached || this.destroyed) return
    this.attached = true
    const doc = this.container.ownerDocument
    this.layer = doc.createElement('div')
    this.layer.setAttribute('data-novasheet-context-menu-layer', '')
    this.menu = doc.createElement('div')
    this.menu.setAttribute('data-novasheet-context-menu', '')
    this.menu.setAttribute('role', 'menu')
    this.menu.setAttribute('aria-label', '单元格操作')
    this.menu.addEventListener('contextmenu', this.onMenuContextMenu)
    this.menu.addEventListener('keydown', this.onMenuKeyDown)
    doc.addEventListener('pointerdown', this.onDocumentPointerDown, true)
    this.layer.appendChild(this.menu)
    doc.body.appendChild(this.layer)
    ensureContextMenuStylesheet(doc)
  }

  applyTheme(theme: Theme): void {
    if (!this.attached) return
    // CSS 变量挂在 layer 自身（不是 container）——portal 模式下 menu 在 body 里，必须通过 layer 继承
    applyContextMenuTheme(this.layer, theme)
  }

  isOpen(): boolean {
    return this.attached && this.opened
  }

  open(options: OpenContextMenuOptions): void {
    if (!this.attached || this.destroyed) return
    this.renderItems(options.items)
    // initial position; must set BEFORE data-open so offsetWidth/Height resolve after visible
    this.menu.style.left = `${options.clientX}px`
    this.menu.style.top = `${options.clientY}px`
    this.menu.setAttribute('data-open', '')
    this.clampToViewport(options.clientX, options.clientY)
    this.opened = true
    this.focusFirstEnabled()
  }

  private clampToViewport(clientX: number, clientY: number): void {
    const EDGE = 8
    const win = this.menu.ownerDocument.defaultView!
    const w = this.menu.offsetWidth
    const h = this.menu.offsetHeight
    let left = clientX
    let top = clientY
    if (left + w > win.innerWidth) left = win.innerWidth - w - EDGE
    if (left < EDGE) left = EDGE
    if (top + h > win.innerHeight) top = clientY - h // flip above pointer
    if (top < EDGE) top = EDGE
    this.menu.style.left = `${left}px`
    this.menu.style.top = `${top}px`
  }

  close(): void {
    if (!this.attached || !this.opened) return
    const wasFocusInMenu = this.menu.contains(document.activeElement)
    this.closeSubmenu()
    this.menu.removeAttribute('data-open')
    this.opened = false
    if (wasFocusInMenu) this.callbacks.onClose?.()
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    if (this.attached) {
      const doc = this.container.ownerDocument
      this.closeSubmenu()
      this.menu.removeEventListener('contextmenu', this.onMenuContextMenu)
      this.menu.removeEventListener('keydown', this.onMenuKeyDown)
      doc.removeEventListener('pointerdown', this.onDocumentPointerDown, true)
      this.layer.parentNode?.removeChild(this.layer)
      this.attached = false
      this.opened = false
    }
  }

  private renderItems(items: readonly ContextMenuItem[]): void {
    while (this.menu.firstChild) this.menu.removeChild(this.menu.firstChild)
    const doc = this.menu.ownerDocument
    let prevItem: ContextMenuItem | null = null
    for (const item of items) {
      // category-based separator: insert when category boundary crosses between defined categories
      const needsSep =
        prevItem !== null &&
        ((prevItem.category !== undefined || item.category !== undefined) &&
          prevItem.category !== item.category)
      if (needsSep) {
        this.appendSeparator(doc)
      }

      const btn = doc.createElement('button')
      btn.setAttribute('role', 'menuitem')
      btn.setAttribute('data-ns-action', item.id)
      btn.setAttribute('tabindex', '-1')
      if (item.disabled) {
        btn.setAttribute('aria-disabled', 'true')
        // do NOT set btn.disabled — keep focusable per ARIA menu pattern (spec §4.7)
      }

      // icon slot
      btn.appendChild(this.renderIconSlot(doc, item.icon))

      // label
      const labelSpan = doc.createElement('span')
      labelSpan.setAttribute('data-ns-menu-label', '')
      labelSpan.textContent = item.label
      btn.appendChild(labelSpan)

      // shortcut / submenu arrow
      const trailSpan = doc.createElement('span')
      trailSpan.setAttribute('data-ns-menu-shortcut', '')
      if (item.submenu?.length) {
        trailSpan.setAttribute('data-ns-submenu-arrow', '')
        trailSpan.textContent = '▶'
      } else {
        trailSpan.textContent = item.shortcut ?? ''
      }
      btn.appendChild(trailSpan)

      if (item.submenu?.length) {
        btn.addEventListener('mouseenter', () => {
          this.openSubmenuFor(btn, item)
        })
      }

      btn.addEventListener('click', () => this.onItemClick(item))
      this.menu.appendChild(btn)

      // separatorAfter backward compat (only if category-based sep wasn't already inserted above)
      if (item.separatorAfter) {
        this.appendSeparator(doc)
      }

      prevItem = item
    }
  }

  private appendSeparator(doc: Document): void {
    const sep = doc.createElement('div')
    sep.setAttribute('role', 'separator')
    this.menu.appendChild(sep)
  }

  private renderIconSlot(doc: Document, icon: MenuIcon | undefined): HTMLSpanElement {
    const slot = doc.createElement('span')
    slot.setAttribute('data-ns-menu-icon-slot', '')
    if (!icon) return slot
    if (icon.kind === 'builtin') {
      slot.setAttribute('data-ns-menu-icon', icon.name)
      slot.textContent = BUILTIN_ICON_GLYPHS[icon.name]
    } else if (icon.kind === 'text') {
      slot.textContent = icon.text
    } else if (icon.kind === 'svg-path') {
      const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg')
      svg.setAttribute('aria-hidden', 'true')
      svg.setAttribute('width', '14')
      svg.setAttribute('height', '14')
      svg.setAttribute('viewBox', '0 0 16 16')
      const path = doc.createElementNS('http://www.w3.org/2000/svg', 'path')
      path.setAttribute('d', icon.path)
      svg.appendChild(path)
      slot.appendChild(svg)
    }
    return slot
  }

  private openSubmenuFor(parentBtn: HTMLButtonElement, item: ContextMenuItem): void {
    this.closeSubmenu()
    if (!item.submenu?.length || item.disabled) return
    const doc = this.menu.ownerDocument
    const sub = doc.createElement('div')
    sub.setAttribute('data-ns-submenu', '')
    sub.setAttribute('role', 'menu')
    for (const subItem of item.submenu) {
      const subBtn = doc.createElement('button')
      subBtn.setAttribute('role', 'menuitem')
      subBtn.setAttribute('data-ns-action', subItem.id)
      subBtn.setAttribute('tabindex', '-1')
      subBtn.textContent = subItem.label
      if (subItem.disabled) subBtn.setAttribute('aria-disabled', 'true')
      subBtn.addEventListener('click', () => {
        if (subItem.disabled) return
        this.callbacks.onSelect(subItem.id)
        this.closeSubmenu()
        this.close()
      })
      sub.appendChild(subBtn)
    }
    // position to the right of parent
    const rect = parentBtn.getBoundingClientRect()
    sub.style.position = 'fixed'
    sub.style.left = `${rect.right}px`
    sub.style.top = `${rect.top}px`
    doc.body.appendChild(sub)
    this.currentSubmenu = sub
  }

  private closeSubmenu(): void {
    if (this.currentSubmenu) {
      this.currentSubmenu.parentNode?.removeChild(this.currentSubmenu)
      this.currentSubmenu = null
    }
  }

  private onItemClick(item: ContextMenuItem): void {
    if (item.disabled) return
    // items with submenus don't fire onSelect on the parent click
    if (item.submenu?.length) return
    this.callbacks.onSelect(item.id)
    this.close()
  }

  private onMenuContextMenu = (event: Event): void => {
    event.preventDefault()
  }

  private onDocumentPointerDown = (event: Event): void => {
    if (!this.opened) return
    const target = event.target as Node | null
    if (target && this.menu.contains(target)) return
    this.close()
  }

  private onMenuKeyDown = (event: KeyboardEvent): void => {
    switch (event.key) {
      case 'Escape':
      case 'Tab':
        event.preventDefault()
        this.close()
        return
      case 'Enter':
      case ' ':
        event.preventDefault()
        this.activateFocused()
        return
      case 'ArrowDown':
        event.preventDefault()
        this.focusMove(1)
        return
      case 'ArrowUp':
        event.preventDefault()
        this.focusMove(-1)
        return
      case 'Home':
        event.preventDefault()
        this.focusFirstEnabled()
        return
      case 'End':
        event.preventDefault()
        this.focusLastEnabled()
        return
    }
  }

  private getItemButtons(): HTMLButtonElement[] {
    return Array.from(this.menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'))
  }

  private enabledButtons(): HTMLButtonElement[] {
    return this.getItemButtons().filter((b) => b.getAttribute('aria-disabled') !== 'true')
  }

  private focusFirstEnabled(): void {
    this.enabledButtons()[0]?.focus()
  }

  private focusLastEnabled(): void {
    const list = this.enabledButtons()
    list[list.length - 1]?.focus()
  }

  private focusMove(delta: 1 | -1): void {
    const list = this.enabledButtons()
    if (list.length === 0) return
    const current = list.findIndex((b) => b === document.activeElement)
    const next = (current + delta + list.length) % list.length
    list[next]?.focus()
  }

  private activateFocused(): void {
    const active = document.activeElement
    if (!(active instanceof HTMLButtonElement)) return
    const id = active.getAttribute('data-ns-action') as string | null
    if (!id) return
    if (active.getAttribute('aria-disabled') === 'true') return
    this.callbacks.onSelect(id)
    this.close()
  }
}
