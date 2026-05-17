# NovaSheet Context Menu（Phase 4.0）

- **Date**: 2026-05-17
- **Status**: Approved
- **Scope**: Cell-body context menu shell + Cut / Copy / Paste menu items (clipboard wiring deferred to Phase 4.1)
- **Deferred**: Column-header / row-header context menus → Phase 4.5 (with insert / delete / hide row-column)

---

## 1. Problem

Phase 3 delivers selection, keyboard navigation, and resize. Users expect spreadsheet-grade **right-click** on cells for Cut / Copy / Paste before (or alongside) keyboard shortcuts. Column / row header menus (insert column, delete row, etc.) depend on Phase 4.5 structural APIs and should not block the first menu milestone.

---

## 2. Goals

1. **Phase 4.0**: DOM context menu on **body cell** hit only; items Cut, Copy, Paste (disabled when not applicable).
2. Reuse existing **hit-test** and **SelectionModel** (right-click may move active cell to clicked cell if outside current range).
3. Same architectural pattern as resize handles: **DOM overlay in `@novasheet/web`**, Theme via CSS variables, no Canvas painting.
4. **Phase 4.1** wires clipboard engine + Ctrl+X/C/V; menu invokes the same commands.
5. **Phase 4.5** adds header-target menus without rewriting the menu shell.

---

## 3. Non-Goals (Phase 4.0)

- Column-header / row-header context menus
- Sort, filter, insert/delete/hide row-column
- Custom menu plugins / i18n framework (hardcode EN labels or minimal zh for Storybook; extensibility later)
- Native OS menu (`<menu>`) — use positioned `<div role="menu">` for styling control
- Touch long-press (optional follow-up in 4.0.1 if needed)

---

## 4. UX

### 4.1 Trigger

| Event | Target | Action |
|-------|--------|--------|
| `contextmenu` | Body cell (not header, not resize handle) | `preventDefault`; open menu at pointer |
| `contextmenu` | Column header / row header | **No menu** in 4.0 (browser default suppressed only if we attach to host — prefer no-op + preventDefault to avoid browser menu over grid) |
| `contextmenu` | Resize handle layer | Ignored (handle stops propagation) |
| During drag-select or resize-drag | Any | **Do not open** |

Right-click on a cell **outside** the current `selectedRange` should:

1. Set `activeCell` / `anchorCell` / `extentCell` to that cell (same as click select).
2. Open menu for that cell context.

Right-click **inside** an existing multi-cell range: keep selection; menu operates on `selectedRange`.

### 4.2 Menu items (4.0)

| Item | Enabled when | Action (4.0) | Action (4.1+) |
|------|----------------|--------------|-----------------|
| Cut | Non-empty selection & clipboard pipeline ready | `disabled` or no-op + callback stub | `grid.cut()` |
| Copy | Same | stub | `grid.copy()` |
| Paste | Clipboard has grid-compatible payload | `disabled` | `grid.paste()` |

Order: **Cut · Copy · Paste** (separator before Paste optional, not required in 4.0).

### 4.3 Close

- Click outside menu
- `Escape`
- Scroll on scroll-host (wheel / scrollbar / programmatic scroll)
- Second `contextmenu` elsewhere (close previous, open new)
- `Grid.destroy()` — remove layer and listeners

### 4.4 Positioning

- `position: fixed` or absolute within grid root converted from `clientX/clientY`
- Clamp to viewport so menu does not overflow window (flip up/left if needed)
- Do **not** reposition on scroll while open — close on scroll instead

---

## 5. Architecture

### 5.1 Package placement

| Piece | Package | Notes |
|-------|---------|-------|
| `ContextMenuModel` / command ids | `@novasheet/core` | Pure types + `getCellContextMenuItems(context)` optional |
| `DomContextMenuLayer` | `@novasheet/web` | DOM mount, open/close, a11y |
| `context-menu-style.ts` | `@novasheet/web` | Injected stylesheet + Theme CSS vars (mirror `resize-handle-style.ts`) |
| `WebGridRuntime.handleHostContextMenu` | `@novasheet/web` | Hit-test, selection update, open menu |
| `DomGridHost` | `@novasheet/web` | `contextmenu` listener on scroll-host or container |
| Storybook story | `apps/storybook` | Demonstrate open + disabled states |

**Dependency direction unchanged:** `core ← web ← web-canvas2d`.

### 5.2 DOM structure

```html
<div data-novasheet-context-menu-layer> <!-- pointer-events: none when closed -->
  <motion role="menu" aria-label="Cell actions" style="display: none">
    <button role="menuitem" data-ns-action="cut">Cut</button>
    <button role="menuitem" data-ns-action="copy">Copy</button>
    <button role="menuitem" data-ns-action="paste">Paste</button>
  </div>
</div>
```

- Layer `z-index: 3` (above handle layer `2`, below future editor `4`).
- Menu `pointer-events: auto` when open.
- Disabled items: `aria-disabled="true"`, no click handler.

### 5.3 Theme tokens (CSS variables on grid container)

| Variable | Source (denseGridTheme) |
|----------|-------------------------|
| `--ns-menu-bg` | `colors.background` |
| `--ns-menu-border` | `colors.gridLineStrong` |
| `--ns-menu-text` | `colors.text` |
| `--ns-menu-text-disabled` | `colors.headerText` |
| `--ns-menu-item-hover` | `colors.hoverRowBg` |
| `--ns-menu-shadow` | new optional `menu.shadow` or `frozenShadow` reuse |

No hardcoded colors in `DomContextMenuLayer` TS.

### 5.4 Runtime flow

```
contextmenu on host
  → if resizeDrag || draggingSelection: return
  → hitTestCell(clientX, clientY)
  → if miss or header band: preventDefault only, return
  → update selection if needed
  → build item list (enabled flags from engine stubs in 4.0)
  → contextMenuLayer.open({ x, y, items, onSelect })
onSelect(action)
  → 4.0: optional dev console / Storybook callback
  → 4.1: engine clipboard commands
```

### 5.5 Invariants

1. Menu does not call `DataSource` / `ChunkedAxis` directly — commands go through `GridEngine` / `WebGridRuntime` (same as resize).
2. One menu instance per `Grid`; `destroy()` idempotent.
3. `frameScheduler` not required for menu animation in 4.0.

---

## 6. Phase 4 roadmap (README alignment)

| Sub-phase | Deliverable |
|-----------|-------------|
| **4.0** | Cell context menu shell + Cut/Copy/Paste UI (stubs/disabled until 4.1) |
| **4.1** | Clipboard read/write + shortcuts |
| **4.2** | Undo / Redo |
| **4.3** | Fill handle |
| **4.4** | Sort / filter |
| **4.5** | Insert / delete / hide row-column + **column / row header** context menus |

---

## 7. Testing

| Test | Location |
|------|----------|
| `getCellContextMenuItems` / enabled rules | `packages/core/tests/interaction/` |
| `DomContextMenuLayer` open/close, disabled click | `packages/web/tests/interaction/` |
| `handleHostContextMenu` updates selection | `packages/web/tests/runtime/WebGridRuntime.test.ts` |
| Storybook manual | `apps/storybook/src/stories/ContextMenu.stories.ts` |

---

## 8. Spec self-review

- [x] Scope bounded to cell-body only; headers explicitly 4.5
- [x] No conflict with Phase 1 resize §6.5 (separate layer, no open during resize-drag)
- [x] Clipboard semantics deferred to 4.1 — 4.0 items may be disabled
- [x] Package placement matches cross-platform split (DOM in web)
- [x] No placeholder TBD for core decisions

---

## 9. References

- Phase 1 resize DOM pattern: spec §6.1, §6.5; `DomHandleLayer`
- Selection hit-test: Phase 3.1 `hitTestCell`
- README Phase 4 breakdown: `README.md` §路线图
