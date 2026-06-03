# Context Menu Feature Package — Design

- **Date**: 2026-06-03
- **Status**: Draft（供 `2026-06-03-novasheet-context-menu-feature-package.md` 实施）
- **Parent**: `docs/superpowers/plans/2026-06-02-novasheet-feature-package-roadmap.md` phase 6
- **Prior art**: `docs/superpowers/specs/2026-05-17-context-menu-design.md`（Phase 4.0 单元格菜单 UX）

---

## 1. Goal

把右键菜单的 **DOM 竖切片**（layer + 打开/关闭 + 命中与选区规则 + 项汇聚 + 选中派发）从 `@novasheet/web` kernel 拆到 `@novasheet/feature-context-menu`，并在 `@novasheet/web` 建立可复用的 **`web.menu-item`** 与 **`web.context-menu`** 贡献点词汇表。

**不变：** `ContextMenuModel`（`getCellContextMenuItems` / 行列表头项纯函数）、`ContextMenuAction` 类型、sort/filter/structure **动作实现**仍由 runtime 经 deps 提供（phase 7–8 再迁各自 feature）。

---

## 2. Architecture

| 层 | 职责 |
|---|---|
| `@novasheet/core` | `ContextMenuItem` / `ContextMenuContext` / `get*ContextMenuItems` 纯函数（DOM-free） |
| `@novasheet/web` | `WebMenuItemProvider` + `WebContextMenu` 契约；runtime 探测 controller，host `contextmenu` 委托 |
| `@novasheet/feature-context-menu` | `ContextMenuController` + `DomContextMenuLayer` + 默认 menu-item 注册 |
| `@novasheet/sheet` | `installContextMenuFeature(ctx)` BOM |

### 2.1 双贡献点

1. **`web.menu-item`** — 按 `order` 汇聚菜单项；可选 `handleAction` 返回 `true` 表示已消费。
2. **`web.context-menu`** — 单实例 controller（`order` 取第一个非 null `create`），持有 layer 与 `handleHostContextMenu` / `handleAction` / `close` / `applyTheme`。

未安装 `web.context-menu` 时：runtime `handleHostContextMenu` no-op（与 clipboard 未安装一致）。

### 2.2 动作派发顺序（与现 `handleContextMenuSelected` 对齐）

1. `rowHeader` → runtime deps `invokeRowHeaderContextMenuAction`
2. `columnHeader` → sort/filter 内置（sortLayer/filterLayer/popover）→ 列结构 invoke
3. `cell` → 若 `onContextMenuAction` 存在则 **完全外抛**（现语义）
4. 否则 → 各 `menu-item` provider 的 `handleAction`
5. 否则 → runtime deps `clipboardCopy/Cut/Paste`（委托已安装的 `WebClipboard`）

### 2.3 债务（本阶段显式保留）

- **键盘** Cmd+C/X/V、F2、导航键仍在 `WebGridRuntime.handleHostKeyDown`（待 `web.keyboard` 或并入后续小 task）。
- **FilterPopover** / 列宽行高 popover 仍在 web + backend。
- **Sort/filter 菜单项文案** 仍来自 `ViewPipeline.collectColumnHeaderMenuItems`（经默认 provider 调用，不迁 `feature-sort-filter`）。

---

## 3. Non-Goals

- 拆 `feature-sort-filter` / `feature-structure`（phase 7–8）。
- 改 `GridOptions.onContextMenuAction` 公共 API。
- engine 事件系统替代 `onCopy` 等（同 clipboard 决策 B）。
- phase 14 resize/reorder 菜单回补。

---

## 4. Acceptance

- `DomContextMenuLayer` / `context-menu-style` 仅在 `feature-context-menu`。
- runtime 无 `setContextMenuLayer`；backend 不 `new DomContextMenuLayer`。
- 默认 Grid：单元格/列头/行头右键行为与拆包前一致（现有 web/sheet 测试绿）。
- 未安装 feature：右键不 crash、不打开菜单。
- `docs/architecture.md` 记录 `web.menu-item` / `web.context-menu`。
