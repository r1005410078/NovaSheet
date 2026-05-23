# NovaSheet Cell Context Menu（Phase 4.0）

- **Date**: 2026-05-17 · **Revised**: 2026-05-18
- **Status**: Approved
- **Scope**: 单元格区域右键菜单 shell + Cut / Copy / Paste 三个菜单项。菜单 **可打开、可关闭、可选中项**；选中通过 `onContextMenuAction` 回调外抛——4.0 不动剪贴板，4.1 在回调里挂上 `cut/copy/paste` 引擎。
- **Out of scope（明确推迟）**：
  - 列头 / 行头右键菜单 → Phase 4.5（与「插入 / 删除 / 隐藏行列」一起）
  - 剪贴板真正读写 + 快捷键 → Phase 4.1
  - 触摸 long-press → Phase 4.0.1（如需）
  - 菜单插件 / i18n 框架 → 路线图后续，4.0 硬编码中英 label

---

## 1. Problem

Phase 3 已有选择、键盘导航、resize。下一个用户期待的电子表格基础动作是 **右键 Cut / Copy / Paste**。但剪贴板语义涉及 ClipboardEvent / async navigator.clipboard / 跨格式序列化，凑一起做会拖大 milestone。

拆分原则：**4.0 只交付菜单 UI 与外抛回调**——菜单生命周期、定位、a11y、与 selection / resize / edit 的交叉规则都先定下来；4.1 单独做剪贴板，菜单不变。

---

## 2. Goals（4.0）

1. 单元格 body 区域右键打开 DOM 菜单，至少含 Cut / Copy / Paste 三项。
2. 项的 `disabled` 由 core 端纯函数 `getCellContextMenuItems(context)` 计算——便于 4.1 复用、便于单测。
3. 选中后通过 `GridOptions.onContextMenuAction(action, context)` 回调外抛——consumer 自己接 4.1 引擎 / 自己 toast / 自己 console.log。
4. DOM overlay 模式跟 resize handle / cell editor 一致：`@novasheet/web` 拥有 layer，Theme 走 CSS 变量，**`@novasheet/core` 不持有 DOM**。
5. 菜单与 selection / resize / cell edit 状态机的交叉规则一次性写清楚（§4.6）。
6. ARIA menu pattern 基本款：role + Esc 关闭 + 键盘 ↑↓ Home/End Enter（4.0 必做）；焦点关闭后回 grid container（§4.5）。

---

## 3. Non-Goals（4.0）

- 列头 / 行头右键菜单（4.5）
- 触摸 long-press、native `<menu>` 元素
- 命令注册 / 用户扩展项 API
- 多级 / 子菜单（4.5 配合插入操作再上）
- 排序 / 筛选 / 插入 / 删除菜单项（散在 4.4 / 4.5）

---

## 4. UX

### 4.1 触发

| 事件          | 命中                             | 行为                                                                     |
| ------------- | -------------------------------- | ------------------------------------------------------------------------ |
| `contextmenu` | body cell                        | `preventDefault`；按 §4.2 更新 selection；菜单在 pointer 处打开          |
| `contextmenu` | 列头 / 行号列                    | `preventDefault`（不弹浏览器菜单），**4.0 不打开自己的菜单**（4.5 接管） |
| `contextmenu` | resize handle                    | handle 内部 `stopPropagation`——浏览器菜单和我们的菜单都不弹              |
| `contextmenu` | 已打开的菜单内部                 | `preventDefault`——不嵌套二级浏览器菜单                                   |
| `contextmenu` | drag-select / resize-drag 进行中 | `preventDefault`，**不开**                                               |
| `contextmenu` | cell 编辑中                      | **先 commit 当前编辑**（同 blur 路径），然后按 body-cell 规则开菜单      |

未来 Shift+F10（键盘触发）：**4.0 暂不实现**，但 API 预留——`Grid.openContextMenuAt(rowIndex, fieldId)` 编程触发，位置取 cell 的右下角；上层组装快捷键时复用。

### 4.2 与 selection 的交互

| 当前 selection    | 右键命中 cell | 行为                                                    |
| ----------------- | ------------- | ------------------------------------------------------- |
| 单格 / 多格 range | **range 内**  | 保留 selection，菜单上下文 = 整个 range                 |
| 单格 / 多格 range | **range 外**  | `setActiveCell(cell)`（同左键单击），menu 上下文 = 该格 |
| 无 active         | 任意 cell     | `setActiveCell(cell)`，menu 上下文 = 该格               |

不引入新的 selection 模式。复用现有 `selection.activeCell / anchorCell / extentCell / selectedRange`。

### 4.3 菜单项（4.0）

固定三项，由 core `getCellContextMenuItems(context)` 计算 `disabled`：

| Item  | id        | enabled when（4.0）                                                           | 4.1 action     |
| ----- | --------- | ----------------------------------------------------------------------------- | -------------- |
| Cut   | `'cut'`   | `context.hasSelection === true` 且后续剪贴板就绪——4.0 始终启用，回调里抛 stub | `grid.cut()`   |
| Copy  | `'copy'`  | 同上                                                                          | `grid.copy()`  |
| Paste | `'paste'` | `context.clipboardReady === true`——4.0 永远 `false` → 渲染为 `disabled`       | `grid.paste()` |

顺序：Cut · Copy · Paste，**Copy 与 Paste 之间一条 separator**（贴近 Excel/Sheets 习惯）。

`context.clipboardReady` 由 consumer 通过 `Grid.setClipboardReady(boolean)` 告知 grid——4.1 引擎实现后自己挂上；4.0 默认 `false`。这样把"剪贴板就绪"的 source-of-truth 留给 consumer / 4.1 引擎，4.0 这一层不臆造状态。

### 4.4 定位与 clamp

- `position: fixed`（视口坐标系）；以 `event.clientX / clientY` 为锚点
- 锚点 = 菜单**左上角**
- Clamp 算法（视口外溢时）：
  - 右溢：`x = window.innerWidth - menu.width - 8`（贴右边 8px 边距）
  - 下溢：**flip**——锚点改为 `y - menu.height`（菜单出现在 pointer **上方**）
  - 上溢（flip 后还出框）：`y = 8`（贴顶 8px）
  - 左溢：`x = 8`（贴左 8px）
- 菜单打开后 **不**随 grid 内容滚动而 reposition——直接 close（见 §4.5）

DPR / 缩放不需要特殊处理（`clientX/Y` 已是 CSS 逻辑像素）。

### 4.5 关闭与焦点

**关闭触发**：

- `Escape` 键（focus 在菜单上时）
- 菜单外任意 `pointerdown`
- 菜单自身的 `contextmenu`（同时打开新一次菜单）
- scroll-host 滚动（wheel / scrollbar drag / programmatic `scrollToCell`）
- `Grid.setData` / `Grid.clearSelection` / `Grid.destroy`
- 选中某一项后

**焦点恢复**：关闭后焦点回到 grid scroll-host（已有的可 focus 容器，跟 Phase 3 键盘导航 focus target 一致）。仅当关闭前焦点确实在菜单上时恢复——避免抢走用户主动转移到别处的焦点。

### 4.6 与其它交互状态的交叉表

| 当前状态             | `contextmenu` 触发                                 | `pointerdown` 触发（拖选 / resize / edit 进入） |
| -------------------- | -------------------------------------------------- | ----------------------------------------------- |
| 菜单已打开           | 关闭旧菜单，按 §4.1 决定是否打开新菜单             | 关闭菜单，再进入下一交互                        |
| 拖选中               | preventDefault，不开                               | n/a                                             |
| resize-drag 中       | preventDefault，不开                               | n/a                                             |
| cell 编辑中          | commit 编辑（走 blur 路径），再按 body-cell 规则开 | commit 编辑                                     |
| 菜单内点 disabled 项 | n/a                                                | 不关闭菜单，focus 留在该项                      |

### 4.7 a11y（菜单内键盘导航 — 4.0 必做）

| 键                  | 行为                                              |
| ------------------- | ------------------------------------------------- |
| `↑` / `↓`           | 移动 focus 到上/下一个**非 disabled**项；首尾循环 |
| `Home` / `End`      | 跳到第一个 / 最后一个非 disabled 项               |
| `Enter` / `Space`   | 选中当前 focus 项（disabled 则 no-op）            |
| `Escape`            | 关闭菜单                                          |
| `Tab` / `Shift+Tab` | 关闭菜单（焦点离开 == 取消）                      |

ARIA：

- 菜单容器 `role="menu"`，`aria-label="Cell actions"`
- 项 `role="menuitem"`；disabled 项 `aria-disabled="true"` **仍可 focus**（标准菜单模式）
- 打开后立即 focus 第一个非 disabled 项

---

## 5. Public API

类型在 `@novasheet/core` 导出；wiring 在 `@novasheet/web`。

```ts
// @novasheet/core
export type ContextMenuAction = 'cut' | 'copy' | 'paste'

export interface ContextMenuContext {
  readonly cell: CellAddress // 触发右键的那一格（不是 active）
  readonly selectedRange: CellRange | null // selection 调整后的范围；为 null 表示无 range
  readonly hasSelection: boolean
  readonly clipboardReady: boolean
}

export interface ContextMenuItem {
  readonly id: ContextMenuAction
  readonly label: string
  readonly disabled: boolean
  readonly separatorAfter?: boolean
}

export function getCellContextMenuItems(context: ContextMenuContext): readonly ContextMenuItem[]
```

```ts
// @novasheet/web — Grid facade
interface GridOptions {
  /** 用户点击非 disabled 菜单项时触发；4.1 后默认接剪贴板引擎，4.0 由 consumer 自定义。 */
  onContextMenuAction?: (action: ContextMenuAction, context: ContextMenuContext) => void
}

class Grid {
  /** 4.1+ 引擎或 consumer 调用，标记剪贴板已就绪——影响 Paste 项的 disabled 状态。 */
  setClipboardReady(ready: boolean): void

  /** 编程触发（为 4.0.1 Shift+F10 / 测试预留）；位置取 cell 右下角。 */
  openContextMenuAt(rowIndex: number, fieldId: string): void

  /** 强制关闭已打开的菜单（destroy / setData / clearSelection 内部自动调用）。 */
  closeContextMenu(): void
}
```

`onContextMenuAction` 默认不挂——consumer 不传就**点击无副作用**（菜单仍会 close）。

---

## 6. 架构

### 6.1 包内位置

| 件                                                         | 包                                                      | 备注                                                                                         |
| ---------------------------------------------------------- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `ContextMenuModel.ts`（types + `getCellContextMenuItems`） | `@novasheet/core/interaction`                           | 纯函数 + 纯类型                                                                              |
| `DomContextMenuLayer.ts`                                   | `@novasheet/web/interaction`                            | DOM overlay；attach/open/close/destroy                                                       |
| `context-menu-style.ts`                                    | `@novasheet/web/host`                                   | 注入 stylesheet + Theme CSS 变量，结构对齐 `resize-handle-style.ts` / `cell-editor-style.ts` |
| `WebHost.onContextMenu` 回调                               | `@novasheet/web/host/WebHost` 接口 + `DomGridHost` 实现 | 类似 `onPointerDown`                                                                         |
| `WebGridRuntime.handleHostContextMenu`                     | `@novasheet/web/runtime`                                | 命中 → 调 selection → 调 layer.open                                                          |
| `Canvas2DBackend`                                          | `@novasheet/web/backends`                               | 实例化 layer + 接 runtime                                                                    |
| Storybook story                                            | `apps/storybook/src/stories/ContextMenu.stories.ts`     | 含编程触发按钮便于截图                                                                       |

依赖方向不变：`core ← web ← web-canvas2d`。

### 6.2 DOM 结构

```html
<div data-novasheet-context-menu-layer>
  <!-- pointer-events: none 关时 -->
  <div role="menu" aria-label="Cell actions" data-novasheet-context-menu hidden>
    <button role="menuitem" data-ns-action="cut">Cut</button>
    <button role="menuitem" data-ns-action="copy">Copy</button>
    <div role="separator"></div>
    <button role="menuitem" data-ns-action="paste" aria-disabled="true">Paste</button>
  </div>
</div>
```

- Layer **`z-index: 3`**——高于 handle layer（2）、低于 cell editor（4，编辑期间不允许开菜单，因此理论不会重叠，但留余地）
- 菜单 `position: fixed`、`pointer-events: auto`
- disabled 项保留 `disabled` HTML 属性 + `aria-disabled`，**但 focusable**（用 `tabindex="-1"` + 手动 `focus()` 管理）

### 6.3 Theme tokens（CSS 变量挂 grid container）

| 变量                         | Theme 路径                            | 备注                                                            |
| ---------------------------- | ------------------------------------- | --------------------------------------------------------------- |
| `--ns-menu-bg`               | `colors.background`                   | 已存在                                                          |
| `--ns-menu-border`           | `colors.gridLineStrong`               | 已存在                                                          |
| `--ns-menu-text`             | `colors.text`                         | 已存在                                                          |
| `--ns-menu-text-disabled`    | `colors.headerText`                   | 已存在，承担次级文本色                                          |
| `--ns-menu-item-hover`       | `colors.menuItemHover` ← **新增**     | 默认值取 `colors.hoverRowBg`；为 4.5 column-header 风格扩展留口 |
| `--ns-menu-separator`        | `colors.gridLine`                     | 已存在                                                          |
| `--ns-menu-shadow`           | `metrics.menuShadow` ← **新增**       | string，例如 `'0 4px 12px rgba(15,23,42,.12)'`                  |
| `--ns-menu-padding-y` / `-x` | `metrics.menuPaddingY / X` ← **新增** | 数字 px                                                         |

**`@novasheet/web/interaction/DomContextMenuLayer.ts` 与 `context-menu-style.ts` 内严禁硬编码 px / 颜色 / 字体值**（同其余 painter / layer 的约束）。

### 6.4 Runtime 时序

```
[Host] contextmenu(clientX, clientY)
  ↓
[Runtime] handleHostContextMenu
  1. 若 resizeDrag || draggingSelection → preventDefault, return
  2. 若 cellEditor.isOpen() → commitCellEdit(false)  // blur 路径
  3. hit = hitTestCell(clientX, clientY)
  4. 若 hit == null || hit.band !== 'body' → preventDefault, return
  5. 若 hit.cell 不在 selectedRange 内 → engine.setActiveCell(hit.cell)
  6. ctx = buildContext(hit.cell)         // 含 clipboardReady
  7. items = getCellContextMenuItems(ctx) // core 纯函数
  8. layer.open({ clientX, clientY, items, onSelect: (id) => this.handleContextMenuAction(id, ctx) })
[Layer] open
  - 渲染 items（hidden=false）
  - viewport clamp（§4.4）
  - focus 第一个非 disabled 项
[Layer] onSelect(id)
  - close()
  - 通过 runtime 回调 → grid 实例 → options.onContextMenuAction?.(id, ctx)
```

### 6.5 不变量

1. **菜单永远不直接读 `DataSource` / `ChunkedAxis`**——所有上下文由 runtime 从 engine 取后传入。
2. **每个 Grid 实例独立 layer**——多 Grid 共存时不共享 DOM、不共享 stylesheet id 之外的状态。
3. **`Grid.destroy()` 必先 `closeContextMenu()` 再卸 layer**——order 写死，避免泄漏 listener。
4. **打开期间禁止 drag-select / resize-drag 进入**——这两个 pointerdown 路径检测到 layer 打开时先 close，再决定是否进入自身交互。
5. **`setData` / `clearSelection` 自动 close**——菜单上下文随 selection 失效。
6. **菜单 DOM 不进 viewport 命中测试**——`hitTestCell` 不需要 aware；菜单层 `pointerdown` 已通过 `stopPropagation` 隔离。

---

## 7. 测试计划

| 测试                                                                                                            | 文件                                                         |
| --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `getCellContextMenuItems` 的 disabled 计算（有无 selection、clipboardReady 切换、disabled 集合稳定）            | `packages/core/tests/interaction/ContextMenuModel.test.ts`   |
| `DomContextMenuLayer` open/close、disabled 项点击 no-op、Esc / 外部 pointerdown 关闭                            | `packages/web/tests/interaction/DomContextMenuLayer.test.ts` |
| Layer 键盘导航：↑↓ 跳过 disabled、Home/End、Enter 触发 onSelect                                                 | 同上                                                         |
| Layer 位置 clamp：右/下溢 flip、左/上溢贴边                                                                     | 同上（用伪 `window.innerWidth/Height`）                      |
| `handleHostContextMenu` 的状态机：drag / resize / edit 期间不开；range 内不动 selection、range 外 setActiveCell | `packages/web/tests/runtime/WebGridRuntime.test.ts`          |
| `Grid` facade：`setClipboardReady` → 重开菜单 Paste 项 enabled；`openContextMenuAt` 编程触发                    | `packages/web/tests/grid/Grid.test.ts`                       |
| Storybook 故事手动验证：默认状态、设 clipboardReady、不传 `onContextMenuAction` 时点击只关闭                    | `apps/storybook/src/stories/ContextMenu.stories.ts`          |

`contextmenu` 事件在 happy-dom 下用 `new MouseEvent('contextmenu', { clientX, clientY, button: 2 })` 派发，dispatch 到 scroll-host。

---

## 8. Risks / Open Questions

| #   | 风险 / 问题                                                                           | 4.0 应对                                                                                                              |
| --- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| R1  | iOS Safari long-press 默认行为（image actions）跟我们的菜单冲突                       | 4.0 不实现 touch；4.0.1 评估是否拦截                                                                                  |
| R2  | z-index 3 在 host 嵌入页面中可能被外层 modal 盖住                                     | 不在 4.0 做主题化；将来 Theme 加 `menuZIndex` token                                                                   |
| R3  | 多 Grid 在同一 stylesheet id 下注入两次                                               | 用 `ensure*Stylesheet(doc)` 复用已有去重模式（与 cell-editor / resize-handle 一致）                                   |
| R4  | 第三方页面有自己的 contextmenu listener stopping propagation                          | container 元素 `addEventListener('contextmenu', ..., { capture: true })` 抢前；文档里提示 host 不要再 stopPropagation |
| R5  | a11y 焦点恢复目标在不同浏览器表现差异                                                 | 4.0 只承诺"回 scroll-host"，不试图记忆精细 focus 位置                                                                 |
| OQ1 | 菜单项 label 是否要 i18n？（目前硬编码 Cut/Copy/Paste）                               | 4.0 硬编码英文；Storybook 用中文 alias 展示；i18n 框架后续                                                            |
| OQ2 | `getCellContextMenuItems` 是否暴露给 consumer 自定义？                                | 4.0 不暴露；4.5 配合命令注册一起设计                                                                                  |
| OQ3 | clipboardReady 是真正的 `navigator.clipboard.read` 异步探测，还是 consumer 手工标记？ | 4.0 留 `setClipboardReady` 手工口；4.1 引擎接入后内部自动维护                                                         |

---

## 9. 路线图对齐

Phase 4 子阶段总览以 README `§路线图` 为单点真实来源；本 spec 不再重复，避免双源漂移。本 spec 只覆盖 **4.0**。

---

## 10. References

- Phase 1 resize DOM 模式：`spec §6.1 / §6.5` + `packages/web/src/interaction/DomHandleLayer.ts`
- Phase 3.5 cell editor DOM 模式：`packages/web/src/interaction/DomCellEditor.ts` + `host/cell-editor-style.ts`
- Selection hit-test：Phase 3.1 `hitTestCell`、`packages/core/src/interaction/SelectionModel.ts`
- ARIA Authoring Practices — Menu pattern：https://www.w3.org/WAI/ARIA/apg/patterns/menu/

---

## 11. Spec self-review

- [x] 4.0 交付物明确：菜单 shell + 三项 + `onContextMenuAction` 回调；剪贴板真正语义放 4.1
- [x] 头区菜单显式归 4.5
- [x] 与 selection / resize / edit 状态机的交叉一次性列清（§4.6）
- [x] Public API 列出（types、Grid facade 新方法、option callback）
- [x] 关闭条件、定位 clamp、焦点恢复都有具体规则
- [x] a11y 键盘导航在 4.0 必做
- [x] 不变量 6 条覆盖多 Grid、destroy 顺序、setData 联动
- [x] 测试计划列到文件粒度
- [x] Risks / OQ 段落显式
- [x] 路线图避免与 README 双源
