# NovaSheet 列头 Hover 菜单入口与统一菜单系统 — 设计

- **日期**：2026-06-16
- **状态**：设计（待 user 复审 → writing-plans）
- **分支**：`main`
- **定位**：为列头增加 Google Sheets 风格的 hover 操作入口，并把右键菜单与列头下拉菜单收敛为同一套菜单系统：统一样式、支持图标/快捷键/分类/子菜单，并提供配置式扩展与 DOM 覆盖两种自定义模式。

---

## 1. 背景与目标

### 1.1 背景

NovaSheet 当前已有列头右键菜单，菜单能力包括筛选、排序、插入列、删除列、隐藏列、调整列宽等。但这些能力需要用户知道右键入口，可发现性弱。Google Sheets 在列头 hover 时会显示一个轻量的下三角操作入口，用户可以直接点击打开列级菜单。

当前 `DomContextMenuLayer` 只渲染纯文本按钮，无法表达 Google Sheets 式菜单里的图标、快捷键提示、分组类别、子菜单箭头，也没有一等的菜单自定义能力。本设计把右键菜单与列头 hover 下拉菜单统一成同一个 DOM 菜单组件，避免后续出现两套菜单视觉和扩展模型。

### 1.2 目标

| # | 能力 |
|---|---|
| 1 | 列头默认保持干净，不为每列常驻显示操作按钮 |
| 2 | 鼠标 hover 到某个列头时，仅该列头右侧显示下三角菜单入口 |
| 3 | 下三角按钮可点击，点击后打开现有 column header context menu |
| 4 | 按钮视觉参考 Google Sheets：小下三角；hover/active 时有浅灰圆形底 |
| 5 | 右键列头菜单原行为保持不变 |
| 6 | 已有排序/筛选状态 icon 与菜单入口共存，不重叠 |
| 7 | 冻结列、横向滚动、Excel column letters 模式下仍正确定位 |
| 8 | 右键菜单与列头下拉菜单使用统一样式与统一渲染组件 |
| 9 | 菜单项支持 icon、快捷键标记、分组/类别、子菜单箭头 |
| 10 | 菜单支持配置式扩展：调用方可增删改菜单项、调整分组、绑定 action |
| 11 | 菜单支持 DOM 覆盖：调用方可完全接管某类菜单的 DOM 渲染 |

### 1.3 非目标

- 不要求一次性补齐 Google Sheets 全部菜单项；第一版只升级模型和渲染能力，默认菜单内容仍基于现有能力
- 不改变行头菜单的打开方式，但行头菜单同样使用统一菜单组件与扩展模型
- 不做移动端触摸长按入口
- 不做表头永久显示按钮的配置项
- 不做多级子菜单完整键盘导航的深层复杂行为；第一版支持一级子菜单展开与点击，后续可增强

---

## 2. 列头入口交互

### 2.1 状态

| 状态 | 表现 |
|---|---|
| 默认 | 列头只显示字段名与已有排序/筛选状态 icon |
| hover 列头 | 当前列右侧显示下三角菜单按钮 |
| hover 按钮 | 按钮出现浅灰圆形底，鼠标 cursor 为 pointer |
| 点击按钮 | 打开现有 column header menu，菜单锚点位于按钮附近 |
| 鼠标离开 header/body | 菜单按钮隐藏；若菜单已打开，菜单保持打开直到现有关闭逻辑触发 |

### 2.2 命中范围

菜单按钮命中区固定在列头右侧，使用 `24px × 24px` 的可点击区域。视觉三角居中绘制，圆形 hover 背景直径约 `24px`。

当列宽不足时：

| 列宽 | 行为 |
|---|---|
| `< 32px` | 不显示菜单按钮，避免遮挡列头与 resize handle |
| `>= 32px` | 显示按钮，字段名最大宽度扣除按钮保留位 |

### 2.3 与已有状态 icon 的关系

排序/筛选状态 icon 继续由 `HeaderPainter` 绘制。hover 菜单按钮固定在最右侧；排序/筛选 icon 向左让位，顺序为：

```text
字段名 | sort/filter icons | hover menu button
```

如果空间不足，字段名优先被截断；icon 与按钮不重叠。

---

## 3. 菜单系统设计

### 3.1 统一菜单形态

右键菜单和列头 hover 下拉菜单都使用同一个 `DomContextMenuLayer` 渲染。打开来源只影响 `ContextMenuContext.targetKind` 与菜单锚点，不影响视觉组件。

菜单视觉参考用户提供的 Google Sheets 截图：

| 区域 | 视觉 |
|---|---|
| 菜单容器 | 白底、轻阴影、圆角、最小宽度约 `320px` |
| 菜单项 | 左侧 icon 槽、中间 label、右侧 shortcut 或 submenu arrow |
| 分组 | 通过 `category` 或 `separatorAfter` 形成分隔线 |
| 禁用项 | label 与 shortcut 降低透明度 |
| hover | 整行浅灰背景 |

### 3.2 ContextMenuItem 模型扩展

`ContextMenuItem` 从纯文本按钮升级为结构化菜单项：

```ts
export interface ContextMenuItem {
  readonly id: ContextMenuAction | (string & {})
  readonly label: string
  readonly disabled?: boolean
  readonly icon?: MenuIcon
  readonly shortcut?: string
  readonly category?: string
  readonly separatorAfter?: boolean
  readonly submenu?: readonly ContextMenuItem[]
}

export type MenuIcon =
  | { readonly kind: 'builtin'; readonly name: BuiltInMenuIconName }
  | { readonly kind: 'svg-path'; readonly path: string }
  | { readonly kind: 'text'; readonly text: string }
```

第一版内置 icon 覆盖现有菜单项需要的集合：`cut`、`copy`、`paste`、`plus`、`trash`、`clear`、`hide`、`resize`、`filter`、`sortAsc`、`sortDesc`、`more`。未提供 icon 的项保留左侧槽位，保证文本对齐。

`category` 用于配置式分组；渲染层按相邻 item 的 category 变化插入 separator。`separatorAfter` 继续保留，兼容现有模型，也允许精确插入分隔线。

### 3.3 默认菜单项升级

默认 cell/column/row 菜单继续由 `ContextMenuModel` 生成，但每个默认项补齐 `icon`、常见 `shortcut`、`category`：

| action | label | icon | shortcut | category |
|---|---|---|---|---|
| `cut` | 剪切 | `cut` | `⌘X` / `Ctrl+X` | `clipboard` |
| `copy` | 复制 | `copy` | `⌘C` / `Ctrl+C` | `clipboard` |
| `paste` | 粘贴 | `paste` | `⌘V` / `Ctrl+V` | `clipboard` |
| `insert-col-left` | 在左侧插入 N 列 | `plus` | - | `structure` |
| `insert-col-right` | 在右侧插入 N 列 | `plus` | - | `structure` |
| `delete-cols` | 删除列 | `trash` | - | `structure` |
| `hide-cols` | 隐藏列 | `hide` | - | `structure` |
| `resize-column-width` | 调整列宽… | `resize` | - | `structure` |
| `filter-open` | 创建过滤器 / 筛选… | `filter` | - | `filter` |
| `sort-asc` | 以 A 到 Z 的顺序排序 | `sortAsc` | - | `sort` |
| `sort-desc` | 以 Z 到 A 的顺序排序 | `sortDesc` | - | `sort` |

快捷键显示由平台决定：macOS 显示 `⌘X/⌘C/⌘V`，其他平台显示 `Ctrl+X/C/V`。

### 3.4 子菜单

`submenu` 表示一级子菜单，渲染时右侧显示箭头。第一版用于配置能力和未来"查看更多列操作"等菜单，不强制默认菜单立刻启用复杂子菜单。

子菜单行为：

- hover 或键盘聚焦父项时打开
- 子菜单贴父项右侧；超出视口时向左翻转
- 点击子菜单项后触发对应 action 并关闭整棵菜单
- disabled 父项不打开子菜单

---

## 4. 自定义菜单扩展

### 4.1 配置式扩展

调用方通过 `GridOptions.contextMenus` 注入菜单配置。它适合"保留默认菜单，只增删改菜单项"。

```ts
export interface ContextMenuExtensionConfig {
  readonly cell?: ContextMenuConfig
  readonly columnHeader?: ContextMenuConfig
  readonly rowHeader?: ContextMenuConfig
}

export interface ContextMenuConfig {
  readonly mode?: 'append' | 'prepend' | 'replace'
  readonly items?: readonly ContextMenuItem[]
  transform?(
    items: readonly ContextMenuItem[],
    ctx: ContextMenuContext,
  ): readonly ContextMenuItem[]
}
```

规则：

| mode | 行为 |
|---|---|
| `append` / undefined | 默认菜单后追加 `items` |
| `prepend` | 默认菜单前插入 `items` |
| `replace` | 不使用默认菜单，只使用 `items` |
| `transform` | 最后执行，可过滤、改 label、改 category、插入 submenu |

action 派发：

- 内置 action 继续走现有 runtime 逻辑
- 自定义 action 走 `onContextMenuAction(action, ctx)`；若调用方未提供 handler，自定义项禁用，避免点击后无反馈

### 4.2 DOM 覆盖模式

调用方可通过 `GridOptions.contextMenuRenderer` 完全接管某类菜单 DOM。它适合上层产品需要自定义 React/Vue/Solid 菜单、复杂权限态、搜索菜单、图标体系或自定义子菜单交互。

```ts
export interface ContextMenuRenderer {
  open(options: ContextMenuRenderOptions): void
  close(): void
  destroy(): void
}

export interface ContextMenuRenderOptions {
  readonly targetKind: ContextMenuTargetKind
  readonly context: ContextMenuContext
  readonly items: readonly ContextMenuItem[]
  readonly anchor: { readonly clientX: number; readonly clientY: number }
  readonly select: (id: string) => void
  readonly close: () => void
}
```

规则：

- 传入 DOM renderer 后，NovaSheet 不渲染内置 `DomContextMenuLayer` 内容，只负责生成 `items/context/anchor` 并调用 renderer
- `select(id)` 会回到 NovaSheet 内部 action 分发，确保内置 action 仍能工作
- `close()` 与 `destroy()` 由 Grid 生命周期调用
- DOM 覆盖模式仍复用配置式扩展后的 `items`，即：默认项 → config 扩展/transform → DOM renderer

---

## 5. 架构设计

### 5.1 状态来源

`GridRuntime` 维护当前 hover 的列头坐标：

```ts
type HoveredHeaderMenuButton =
  | { readonly viewCol: number; readonly pressed: boolean }
  | null
```

第一版只需要 `viewCol`；`pressed` 可由菜单打开状态或 pointer down 状态扩展。

### 5.2 Header 渲染路径

`RenderFrame` 增加列头 hover 菜单状态：

```ts
interface RenderFrame {
  hoveredColumnHeaderMenu?: {
    readonly colIndex: number
  }
}
```

`Canvas2DRenderer` 将该状态传给 `HeaderPainter`。`HeaderPainter` 在指定列右侧绘制菜单按钮，并为字段名与状态 icon 保留宽度。

### 5.3 点击路径

`GridRuntime` 增加 header menu button hit-test：

```ts
private hitTestColumnHeaderMenuButton(event: WebPointerEvent): { colIndex: number } | null
```

命中后复用统一菜单打开路径：

- 构造 `ColumnHeaderMenuContext`
- 生成默认列头菜单项
- 应用 `GridOptions.contextMenus.columnHeader`
- 内置 DOM 菜单或 `contextMenuRenderer` 打开
- 设置 `lastContextMenuContext` 与 `lastContextMenuPoint`

右键列头路径继续走 `handleHostContextMenu`，但菜单项生成、配置扩展、DOM 覆盖与列头 hover 下拉共用同一套逻辑。

### 5.4 坐标系统

命中测试使用 view 坐标，因为 header 当前绘制与 selection 都以 view col 为准。菜单 context 中的 `field` 来自当前 view schema，`colIndex` 为 view col。

冻结列和横向滚动下，`Canvas2DRenderer` 已按 region 分段绘制 header。按钮绘制与 hit-test 必须使用与 header cell 相同的几何：

```text
buttonX = headerSegmentX + colsAxis.indexToPosition(viewCol) - scrollOffsetX + colWidth - padX - buttonSize
```

---

## 6. 文件边界

| 文件 | 职责 |
|---|---|
| `packages/core/src/features/context-menu/ContextMenuModel.ts` | 扩展 `ContextMenuItem` 模型，补默认 icon/shortcut/category，合并配置式扩展 |
| `packages/core/src/dom/interaction/DomContextMenuLayer.ts` | 渲染统一菜单 UI：icon、shortcut、category separator、submenu |
| `packages/core/src/dom/host/context-menu-style.ts` | 菜单统一样式 token 与 Google Sheets 风格布局 |
| `packages/core/src/Grid.ts` | 暴露 `contextMenus` 与 `contextMenuRenderer` 配置 |
| `packages/core/src/kernel/render/RenderFrame.ts` | 增加 frame 中的 hover header menu 状态 |
| `packages/core/src/engine/DefaultGridEngine.ts` | 保存 runtime 设置的 hover header menu 状态，并在 `getFrame()` 时传给 frame assembler |
| `packages/core/src/engine/GridEngine.ts` | 增加 engine 内部方法用于设置 hover header menu 状态 |
| `packages/core/src/engine/FrameAssembler.ts` | 将 engine 输入中的 hover 状态写入 `RenderFrame` |
| `packages/core/src/dom/runtime/GridRuntime.ts` | 监听 pointer move/click，维护 hover 状态，点击打开列头菜单，分发自定义菜单 action |
| `packages/canvas2d/src/render/Canvas2DRenderer.ts` | 将 frame hover 状态传给 header painter |
| `packages/canvas2d/src/painters/HeaderPainter.ts` | 绘制 hover 菜单按钮并调整 icon/text 保留空间 |
| `packages/core/tests/features/context-menu/ContextMenuModel.test.ts` | 验证默认项元数据、配置式扩展、transform |
| `packages/core/tests/dom/interaction/DomContextMenuLayer.test.ts` | 验证统一菜单 DOM：icon、shortcut、separator、submenu |
| `packages/canvas2d/tests/painters/HeaderPainter.test.ts` | 验证按钮绘制与状态 icon 让位 |
| `packages/core/tests/dom/runtime/GridRuntime.test.ts` | 验证点击按钮打开列头菜单；右键行为不退化；DOM 覆盖模式 |

hover 状态虽然由 DOM/runtime 输入产生，但第一版明确走 `engine.getFrame()` 契约下发到 renderer，保持 renderer 只消费 `RenderFrame` 的既有架构。

---

## 7. 测试策略

| 层级 | 测试 |
|---|---|
| ContextMenuModel | 默认菜单项含 icon/shortcut/category；配置式 append/prepend/replace/transform 正确 |
| DomContextMenuLayer | 渲染 icon、shortcut、分组 separator、submenu arrow；点击子菜单项派发 action |
| Runtime | DOM 覆盖模式收到 items/context/anchor；调用 `select()` 可触发内置 action |
| Painter | hover col 绘制下三角；非 hover col 不绘制；sort/filter icon 与按钮不重叠 |
| Runtime | pointer move 到列头后刷新；点击按钮打开 column header menu |
| Runtime | 右键列头菜单仍打开同一组菜单项 |
| Runtime | body 区点击不触发 header menu button |
| Integration | canvas renderer 将 hover 状态传到 HeaderPainter |

所有测试使用 `bun:test`。Canvas painter 测试使用 `RecordingContext2D`。

---

## 8. BDD 验收场景

### 8.1 列头 hover 入口

```gherkin
Feature: 列头 hover 菜单入口

  Scenario: hover 列头时仅当前列显示菜单按钮
    Given 表格存在可见列头
    When 鼠标移动到 B 列列头
    Then B 列列头显示下拉菜单按钮
    And 其他列头不显示下拉菜单按钮

  Scenario: 窄列不显示菜单按钮
    Given B 列宽度小于 32px
    When 鼠标移动到 B 列列头
    Then B 列列头不显示下拉菜单按钮

  Scenario: 排序和筛选图标不与菜单按钮重叠
    Given B 列存在排序或筛选状态图标
    When 鼠标移动到 B 列列头
    Then 排序或筛选图标排列在下拉菜单按钮之前
    And 图标与按钮不重叠
```

### 8.2 列头菜单打开

```gherkin
Feature: 列头下拉入口打开统一菜单

  Scenario: 点击列头下拉入口打开列菜单
    Given 鼠标位于 B 列列头
    And 下拉菜单按钮可见
    When 用户点击下拉菜单按钮
    Then 列头上下文菜单在按钮附近打开
    And 菜单上下文指向 B 列

  Scenario: 右键列头打开同一菜单模型
    Given B 列可见
    When 用户在 B 列列头打开上下文菜单
    Then 列头上下文菜单打开
    And 菜单项与 B 列列头下拉菜单项一致

  Scenario: 菜单打开后鼠标离开列头仍保持可见
    Given 列头下拉菜单已打开
    When 鼠标离开列头区域
    Then 菜单保持打开，直到现有关闭触发条件发生
```

### 8.3 统一菜单样式

```gherkin
Feature: 统一上下文菜单展示

  Scenario: 默认菜单项渲染图标、文本和快捷键
    Given 剪贴板菜单分组可用
    When 菜单打开
    Then 剪切、复制、粘贴项渲染内置图标
    And 剪切、复制、粘贴项渲染当前平台快捷键

  Scenario: 类别变化生成分隔线
    Given 菜单项包含 clipboard 和 structure 两个类别
    When 菜单打开
    Then 两个类别之间渲染分隔线

  Scenario: 禁用项可见但不可选择
    Given 某个菜单项处于禁用状态
    When 菜单打开
    Then 该菜单项以禁用样式渲染
    And 点击该菜单项不会派发 action
```

### 8.4 配置式扩展

```gherkin
Feature: 上下文菜单配置式扩展

  Scenario: 在默认项之后追加自定义项
    Given GridOptions.contextMenus.columnHeader mode 为 append
    And 已配置一个自定义菜单项
    When 列头菜单打开
    Then 自定义项出现在默认项之后

  Scenario: 使用自定义项替换默认项
    Given GridOptions.contextMenus.columnHeader mode 为 replace
    And 已配置一个自定义菜单项
    When 列头菜单打开
    Then 只渲染已配置的自定义项

  Scenario: transform 可以移除并重新分组菜单项
    Given GridOptions.contextMenus.columnHeader.transform 移除排序 action
    And 修改某个自定义项的 category
    When 列头菜单打开
    Then 排序 action 不会被渲染
    And 自定义项出现在 transform 后的类别分组中

  Scenario: 自定义 action 需要 handler
    Given 某个自定义菜单项使用自定义 action id
    And 未配置 GridOptions.onContextMenuAction
    When 菜单打开
    Then 该自定义菜单项处于禁用状态
```

### 8.5 DOM 覆盖

```gherkin
Feature: 上下文菜单 DOM 覆盖

  Scenario: 自定义 renderer 收到解析后的菜单选项
    Given 已配置 GridOptions.contextMenuRenderer
    When 列头菜单打开
    Then NovaSheet 调用 contextMenuRenderer.open
    And options 包含 targetKind、context、items、anchor、select 和 close

  Scenario: 自定义 renderer 可以派发内置 action
    Given 已配置 GridOptions.contextMenuRenderer
    And 自定义 renderer 使用内置 action id 调用 select
    When 用户激活该菜单项
    Then NovaSheet 派发内置上下文菜单 action

  Scenario: Grid destroy 会销毁自定义 renderer
    Given 已配置 GridOptions.contextMenuRenderer
    When 调用 Grid.destroy
    Then contextMenuRenderer.destroy 被调用一次
```

---

## 9. 决策记录

| 决策 | 结论 | 原因 |
|---|---|---|
| 显示策略 | 仅 hover 当前列显示 | 对齐 Google Sheets，表头更干净 |
| 菜单组件 | 右键菜单与列头下拉菜单统一 | 避免视觉、快捷键、扩展机制分叉 |
| 默认菜单内容 | 复用现有菜单能力，升级元数据 | 控制范围，避免一次性补齐全部 Google Sheets 项 |
| 自定义模式 | 配置式扩展 + DOM 覆盖 | 分别覆盖常规扩展和高级产品定制 |
| 视觉形态 | 下三角 + hover 圆形浅灰底 | 对齐用户截图 |
| 坐标 | view col | 当前 header、selection、view pipeline 都在 view 空间工作 |
| 窄列 | `< 32px` 不显示 | 避免遮挡 resize handle 与列头内容 |
