# `@zhiguang/react`

[English README](README.md)

NovaSheet 的 React 适配包。本包把 `@zhiguang/core` 的 imperative `Grid`（经 `@zhiguang/canvas2d` 渲染）包装成 React 组件、hooks 与一套开箱即用的 Excel 风格壳层。它**不是**引擎也不是渲染器——不持有表格状态，不实现 mutation 逻辑，不做 Canvas 绘制。下面每项能力最终都会调用某个公开 `Grid` 方法；这些方法的行为保证见 [`@zhiguang/core`](../core/README.zh-CN.md)。

行为同时以 Given/When/Then 场景固化在 [`tests/excel/scenarios/*.md`](tests/excel)（索引见 [`tests/excel/SCENARIOS.md`](tests/excel/SCENARIOS.md)），分 L3a（壳层/DOM/props/ref/StrictMode）→ L3b（toolbar 点击 → `grid.*` 接线）→ L3c（用户旅程）三层——见文末[测试](#测试)。

## 安装

```bash
bun add @zhiguang/react react react-dom
```

`@zhiguang/core` 与 `@zhiguang/canvas2d` 作为本包自身依赖一并安装；`react`/`react-dom`（>=18.3）是 peer dependency。

## 快速开始

```tsx
import { NovaExcel } from '@zhiguang/react'

// 零配置：自带工具栏的空白、可无限滚动的 A–Z × 1000 稀疏工作簿。
export function BlankWorkbook() {
  return <NovaExcel className="h-[600px] w-full" />
}
```

```tsx
import { InMemoryDataSource } from '@zhiguang/core'
import { NovaSheetGrid } from '@zhiguang/react'

const data = new InMemoryDataSource({
  schema: { fields: [{ id: 'name', name: 'Name', type: 'text', width: 160 }] },
  rows: [{ name: 'Alice' }, { name: 'Bob' }],
})

// 不带工具栏的纯表格。
export function PlainGrid() {
  return <NovaSheetGrid data={data} className="h-[480px] w-full" />
}
```

`@zhiguang/react` 不内置全局 CSS。内置工具栏使用 Tailwind utility class，消费方需要在应用里加载 Tailwind，并把 `packages/react/src/**/*`（或发布后的组件代码）纳入 Tailwind content scan。

## 职责

| 做什么 | 说明 |
| --- | --- |
| React 生命周期绑定 | 在 mount 时创建 `Grid`，在 unmount 时调用 `Grid.destroy()`；兼容 Strict Mode 的 mount → unmount → mount 流程。 |
| DOM 容器管理 | 持有表格宿主元素，把 container ref 与 `Grid` facade 连接起来；自身不绘制 canvas。 |
| 后端默认装配 | 默认组合 `@zhiguang/core` 的 `Grid` 与 `@zhiguang/canvas2d` 的 `canvas2dBackend`。 |
| React API 适配 | 在 imperative facade 之上提供组件、hooks、ref handle、typed 事件回调与 props diff 策略。 |
| 业务工具栏 | 提供 `NovaSheetToolbar`——只负责展示和派发 typed action，React 层不实现引擎逻辑。 |
| 业务集成入口 | 为应用层接入数据源、schema、theme、frozen、selection、editing、clipboard、undo/redo 提供稳定入口。 |

| 不做什么 | 原因 |
| --- | --- |
| 不实现引擎状态 | `DefaultGridEngine`、mutation、undo、view/raw 坐标、`DataSource` 协议属于 `@zhiguang/core`。 |
| 不实现 Canvas 绘制 | renderer、painters、HighDPI、text measure 属于 `@zhiguang/canvas2d`。 |
| 不绕过 `Grid` facade | 所有 mutation 必须经 `Grid` 的公开方法。 |
| 不读取 renderer 内部状态 | 只持有公开 `Grid` handle，不依赖 `Canvas2DRenderer` 或 painter 私有结构。 |
| 不硬编码视觉值 | 视觉值仍来自 core 的 `Theme`；本层只管容器尺寸与业务 props。 |

## 依赖方向

```text
@zhiguang/core      Grid facade · engine · DOM runtime · contracts
        ↑
@zhiguang/canvas2d  Canvas2D RenderBackend implementation
        ↑
@zhiguang/react     React component/hooks adapter
        ↑
business apps        React applications
```

`@zhiguang/react` 可以依赖 `core` 与 `canvas2d`，反向依赖禁止——两者都不得 import 本包。包内分层（`excel/` vs `features/grid` vs `features/toolbar` vs `components`/`lib`）与 import 方向规则见 [`docs/project-structure.md`](docs/project-structure.md)、[`docs/project-standards.md`](docs/project-standards.md)；由 `bun run lint:react-boundary` 强制。

## 组件

| 组件 | 是什么 |
| --- | --- |
| `NovaSheetGrid` | 不含工具栏的纯 React 表格。包装 core `Grid` + `canvas2dBackend`；mount/destroy 在 Strict Mode 下安全。Props 基本镜像 `GridOptions`（去掉 `backend`）加标准 `div` props。 |
| `useNovaSheetGrid` | 驱动 `NovaSheetGrid` 的 hook。返回 `{ containerRef, gridRef }`，可在同一套 mount/update 逻辑上搭自己的布局。 |
| `NovaExcel` | 开箱即用 Excel 壳层：`NovaSheetGrid` + `NovaSheetToolbar` + 内置 action 接线。省略 `data` 时默认用内部 `SparseExcelDataSource` + `excelWorkspace: true` + `excelHeaders: true`。 |
| `useNovaExcelToolbar` | 驱动 `NovaExcel` 工具栏接线的无头 hook（undo/redo/clipboard/fill/border/merge/text-wrap/value-format → `grid.*`，并同步 toolbar state）。可用它在同一套 action 路由上搭一个完全自定义的工具栏 UI。 |
| `NovaSheetToolbar` | 独立的紧凑电子表格工具栏组件。通过 `onAction` 派发 typed `ToolbarAction`——它自己从不调用 `Grid`。 |
| `createReactCellEditor` | 适配器：把一个 React 组件包成核心 `CellEditor`（inline/popover/modal），供 `GridOptions.cellEditors` 使用。 |
| `createReactCellFilterEditor` | 适配器：把一个 React 组件包成自定义类型的 filter UI（`CellFilterEditor`），与 `CellTypeDefinition.filterOperators` 的 predicate 逻辑解耦。 |
| `defaultToolbarItems`、`deriveToolbarStateFromGrid`、`useNovaSheetToolbarState`、`CustomColorPicker`、`CHECKERBOARD_BG`、`ToolbarColorPalette`、`ToolbarColorPaletteCustom` | `NovaSheetToolbar` 背后更底层的构件（默认 item 顺序、Grid→toolbar-state 纯推导、取色器 UI），用于不 fork 整个组件就拼出定制工具栏。 |

## 使用示例

### 纯表格

```tsx
import { InMemoryDataSource, denseGridTheme } from '@zhiguang/core'
import { NovaSheetGrid, type NovaSheetGridRef } from '@zhiguang/react'
import { useRef } from 'react'

export function Sheet({ data }: { data: InMemoryDataSource }) {
  const ref = useRef<NovaSheetGridRef>(null)
  return (
    <NovaSheetGrid
      ref={ref}
      data={data}
      theme={denseGridTheme}
      frozen={{ topRows: 1 }}
      onSelectionChange={(selection) => console.log(selection)}
      className="h-[480px] w-full"
    />
  )
}
```
`ref.current.grid` 就是底层的 core `Grid` 实例——`NovaSheetGridRef` 没有直接暴露的方法（`refresh`、`destroy`、`scrollToRow`、`scrollToCell`、`setColumnWidth`、`setFrozen` 之外的一切）仍可经它访问（`ref.current.grid.setValueFormat(...)`、`.mergeCells(...)` 等）。

### 带/不带数据的 Excel 壳层

```tsx
import { SparseExcelDataSource } from '@zhiguang/core'
import { NovaExcel } from '@zhiguang/react'

const data = new SparseExcelDataSource()
data.updateCell(0, 'A', 'NovaSheet')

export function ExcelSheet() {
  return (
    <NovaExcel
      data={data}
      className="h-[560px] w-full"
      onToolbarAction={(action) => console.log(action.id)}
    />
  )
}

// 省略 data 即可免费获得内部 SparseExcelDataSource + excelWorkspace 模式。
export function BlankExcel() {
  return <NovaExcel className="h-[560px] w-full" />
}
```
`showToolbar={false}` 会去掉内置 `NovaSheetToolbar` 的 DOM，但 grid 与 `ref` 依旧完全可用——适合嵌入只读表格，或完全靠 `ref.current.grid` 驱动一个自定义工具栏。

### 经 ref 的结构性与选区回调

```tsx
<NovaExcel
  onSelectionChange={(s) => console.log(s.activeCell)}
  onRowsInserted={(e) => console.log('inserted at', e.at, e.newIds)}
  onColumnsDeleted={(e) => console.log('removed', e.removed)}
  onUndo={(e) => console.log(e.command)}
/>
```
这些回调与 `GridOptions` 的同名回调逐一对应；`NovaExcel` 会把它们与自己的 toolbar-state 同步组合起来（先调用你的回调，再让工具栏重新推导状态），而不是替换掉它们。

### 完全自定义工具栏（`useNovaExcelToolbar`）

```tsx
import { useRef } from 'react'
import { NovaSheetGrid, useNovaExcelToolbar, type NovaSheetGridRef } from '@zhiguang/react'

function CustomToolbarSheet({ data }) {
  const gridRef = useRef<NovaSheetGridRef>(null)
  const { toolbarState, disabledActionIds, handleToolbarAction } = useNovaExcelToolbar({
    getGrid: () => gridRef.current?.grid ?? null,
  })

  return (
    <div className="flex h-full flex-col">
      <button disabled={disabledActionIds.includes('undo')} onClick={() => handleToolbarAction({ id: 'undo' })}>
        撤销
      </button>
      <button onClick={() => handleToolbarAction({ id: 'fill-color', color: '#fff2cc' })}>高亮</button>
      <NovaSheetGrid ref={gridRef} data={data} className="flex-1" />
    </div>
  )
}
```
`handleToolbarAction` 会解析出一个选区（没有选区时回退到默认范围，与 `setValueFormat` 这类工具栏 action 的行为一致），调用对应的 `grid.*` 方法，再重新推导 `toolbarState`/`disabledActionIds`——这正是 `NovaExcel` 内部使用的同一套路由，只是少了它自带的 UI。

### 独立使用 `NovaSheetToolbar`

```tsx
import { NovaSheetToolbar } from '@zhiguang/react'

export function SheetToolbar() {
  return (
    <NovaSheetToolbar
      state={{ zoom: '100%', textWrap: '溢出' }}
      disabledActionIds={['undo', 'redo']}
      onAction={(action) => console.log(action.id)}
    />
  )
}
```
`NovaSheetToolbar` 从不接触 `Grid`——它只渲染 `state`/`disabledActionIds`，把用户意图通过 `onAction({ id })` 交出去。把它和上面的 `useNovaExcelToolbar` 搭在一起，就是 `NovaExcel` 自身的构造方式。

### 自定义单元格编辑器

```tsx
import { createReactCellEditor, type ReactCellEditorProps } from '@zhiguang/react'

function AssigneePicker({ value, commit, cancel }: ReactCellEditorProps) {
  return (
    <div>
      {['Alice', 'Bob', 'Carol'].map((name) => (
        <button key={name} onClick={() => commit(name)}>{name}</button>
      ))}
      <button onClick={cancel}>取消</button>
    </div>
  )
}

const assigneeEditor = createReactCellEditor(AssigneePicker, { kind: 'popover' })

<NovaSheetGrid data={data} cellEditors={{ assignee: assigneeEditor }} />
```
`createReactCellEditor` 在每次打开/关闭时挂载/卸载一个 React root，并把完整的核心 `CellEditorOpenContext`（`value`、`field`、`rect`、`trigger`、`getAttachment`/`setAttachment` 等）连同 `commit`/`cancel` 一起转发为 props。`kind: 'inline'`（默认）把编辑器叠在单元格矩形上；`'popover'`/`'modal'` 则定位在它下方。

### 自定义筛选编辑器

```tsx
import { createReactCellFilterEditor, type ReactCellFilterEditorProps } from '@zhiguang/react'

function AssigneeFilter({ value, apply, cancel }: ReactCellFilterEditorProps) {
  const selected = new Set(Array.isArray(value) ? value : [])
  return (
    <div>
      {['Alice', 'Bob', 'Carol'].map((name) => (
        <label key={name}>
          <input type="checkbox" checked={selected.has(name)} onChange={() => { /* toggle */ }} />
          {name}
        </label>
      ))}
      <button onClick={() => apply({ operatorId: 'assignee-is-any-of', value: [...selected] })}>应用</button>
      <button onClick={cancel}>取消</button>
    </div>
  )
}

const assigneeFilterEditor = createReactCellFilterEditor(AssigneeFilter)
```
这个 React 组件只负责采集 `operatorId` + `value`——真正的筛选语义仍在 `core` 侧的 `cellTypes[type].filterOperators[...].matches(...)` 里。这个编辑器不含任何业务逻辑，纯粹是"选哪个已注册的 operator/value"的 UI 表面。

### 在 React 里把一个自定义类型完整拼起来

把 `createReactCellEditor`、`cellAttachments`、canvas renderer 与 `NovaSheetToolbar` 扩展项组合起来的旗舰示例，是 `@zhiguang/cell-kit` 里交付的 rich-text 单元格类型，完整接线见 [`apps/storybook/src/stories/RichText.stories.ts`](../../apps/storybook/src/stories/RichText.stories.ts)。它的 `richTextExtension.toolbarExtension(controller)` 接入 `NovaSheetToolbar` 的 `extensionItems` prop——这正是任何需要操作"当前打开的单元格编辑器"（而非操作 grid 选区）的自定义 React 控件（取色器、公式栏按钮……）该用的同一条缝。

## 已知缺口：并非所有 `GridOptions` 字段都会被转发

`NovaSheetGridProps` 的类型是 `Omit<GridOptions, 'backend'>`，所以 TypeScript 会接受任何 core `GridOptions` 字段作为 prop。但目前运行时，`NovaSheetGrid` / `useNovaSheetGrid` 只转发：`data`、`theme`、`frozen`、`defaultRowHeight`、`excelHeaders`、`excelWorkspace`、`locale`、`formatters`、`cellEditors`，以及已文档化的回调（`onContextMenuAction`、剪贴板的 `onCopy`/`onCut`/`onPaste`/`onPasteSkipped`、`onUndo`/`onRedo`/`onFill`、结构性的 `onRows*`/`onColumns*`/`onHide*Change`、`onSelectionChange`）。

**尚未转发**：`cellTypes`、`cellAttachments`、`validators`、`validationBatchSize`、`validationMaxConcurrent`、`contextMenus`、`contextMenuRenderer`、`fillCellTypes`。把它们当 JSX prop 传入不会报类型错误，但对配置表格来说是个 no-op——而且具体到 `<NovaSheetGrid>`/`<NovaExcel>`，这个未识别的 prop 会落到宿主 `<div>` 上变成一个原始 DOM 属性（React 会在控制台报未知属性警告）。如果现在就需要用到这些选项，请直接构造 `Grid`（见 [`@zhiguang/core`](../core/README.zh-CN.md)）而不要经过这层适配，或者去扩展 `useNovaSheetGrid` 的解构列表。

## 测试

```bash
bun test                      # tests/excel/**, tests/features/**
bun run lint:scenario-coverage
bun run typecheck
```

`tests/excel/` 是本包主要的行为测试战场（Core 自己的 L0–L2 行为测试套件在 `@zhiguang/core`，见其 README）。场景分层为 **L3a** 壳层/DOM/props/ref/StrictMode、**L3b** toolbar 点击 → `grid.*` 接线、**L3c** 用户旅程——索引见 [`tests/excel/SCENARIOS.md`](tests/excel/SCENARIOS.md)，全文在 `tests/excel/scenarios/*.md`。`lint:scenario-coverage` 会对没有对应测试的场景、以及没有对应场景的测试都判失败。
