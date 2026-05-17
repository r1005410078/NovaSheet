/**
 * Phase 4.0 — DOM 右键菜单层（生命周期 + themed CSS）。
 *
 * 维护一个 `[data-novasheet-context-menu-layer]` overlay 和一个
 * `[data-novasheet-context-menu]` 菜单节点。每次 open() 复用同一节点，
 * 仅重新渲染 items。键盘导航 + 位置 clamp 在 Task 4/5 中添加。
 */

import type { ContextMenuAction, ContextMenuItem, Theme } from '@novasheet/core'
import { applyContextMenuTheme, ensureContextMenuStylesheet } from '../host/context-menu-style'

export interface DomContextMenuLayerCallbacks {
  onSelect: (id: ContextMenuAction) => void
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

  constructor(container: HTMLElement, callbacks: DomContextMenuLayerCallbacks) {
    this.container = container
    this.callbacks = callbacks
  }

  attach(): void {
    if (this.attached || this.destroyed) return
    this.attached = true
    this.layer = document.createElement('div')
    this.layer.setAttribute('data-novasheet-context-menu-layer', '')
    this.menu = document.createElement('div')
    this.menu.setAttribute('data-novasheet-context-menu', '')
    this.menu.setAttribute('role', 'menu')
    this.menu.setAttribute('aria-label', 'Cell actions')
    this.menu.addEventListener('contextmenu', this.onMenuContextMenu)
    this.menu.addEventListener('keydown', this.onMenuKeyDown)
    document.addEventListener('pointerdown', this.onDocumentPointerDown, true)
    this.layer.appendChild(this.menu)
    this.container.appendChild(this.layer)
    ensureContextMenuStylesheet(this.container.ownerDocument)
  }

  applyTheme(theme: Theme): void {
    if (!this.attached) return
    applyContextMenuTheme(this.container, theme)
  }

  isOpen(): boolean {
    return this.attached && this.opened
  }

  open(options: OpenContextMenuOptions): void {
    if (!this.attached || this.destroyed) return
    this.renderItems(options.items)
    this.menu.style.left = `${options.clientX}px`
    this.menu.style.top = `${options.clientY}px`
    this.menu.setAttribute('data-open', '')
    this.opened = true
    this.focusFirstEnabled()
  }

  close(): void {
    if (!this.attached || !this.opened) return
    this.menu.removeAttribute('data-open')
    this.opened = false
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    if (this.attached) {
      this.menu.removeEventListener('contextmenu', this.onMenuContextMenu)
      this.menu.removeEventListener('keydown', this.onMenuKeyDown)
      document.removeEventListener('pointerdown', this.onDocumentPointerDown, true)
      if (this.layer.parentNode === this.container) {
        this.container.removeChild(this.layer)
      }
      this.attached = false
      this.opened = false
    }
  }

  private renderItems(items: readonly ContextMenuItem[]): void {
    while (this.menu.firstChild) this.menu.removeChild(this.menu.firstChild)
    for (const item of items) {
      const btn = document.createElement('button')
      btn.setAttribute('role', 'menuitem')
      btn.setAttribute('data-ns-action', item.id)
      btn.setAttribute('tabindex', '-1')
      btn.textContent = item.label
      if (item.disabled) {
        btn.setAttribute('aria-disabled', 'true')
        btn.disabled = true
      }
      btn.addEventListener('click', () => this.onItemClick(item))
      this.menu.appendChild(btn)
      if (item.separatorAfter) {
        const sep = document.createElement('div')
        sep.setAttribute('role', 'separator')
        this.menu.appendChild(sep)
      }
    }
  }

  private onItemClick(item: ContextMenuItem): void {
    if (item.disabled) return
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
    const id = active.getAttribute('data-ns-action') as ContextMenuAction | null
    if (!id) return
    if (active.getAttribute('aria-disabled') === 'true') return
    this.callbacks.onSelect(id)
    this.close()
  }
}
