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
}
