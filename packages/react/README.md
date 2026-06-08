# `@novasheet/react`

> React adapter package for NovaSheet. This package is the React-facing business integration layer, not a spreadsheet engine or renderer.

## 职责

`@novasheet/react` 负责把 NovaSheet 的 imperative browser API 包装成 React 可消费的组件与 hooks，让业务应用可以用 React 生命周期、安全的 ref、受控/非受控 props 和事件回调来使用表格。

| 职责 | 说明 |
| --- | --- |
| React 生命周期绑定 | 在 mount 时创建 `Grid`，在 unmount 时调用 `Grid.destroy()`；必须兼容 React Strict Mode 的 mount → unmount → mount 流程。 |
| DOM 容器管理 | 持有表格宿主元素，把 container ref 与 `Grid` facade 连接起来；不直接绘制 canvas。 |
| 后端默认装配 | 默认组合 `@novasheet/core` 的 `Grid` 与 `@novasheet/canvas2d` 的 `canvas2dBackend`，同时保留显式注入 backend 的能力。 |
| React API 适配 | 提供面向 React 的组件、hooks、ref handle、事件回调和 props diff 策略。 |
| 业务工具栏 | 提供 `NovaSheetToolbar` 等业务 UI 组件；首版只负责展示和派发 typed action，不在 React 层实现引擎能力。 |
| 业务集成入口 | 为应用层接入数据源、schema、theme、frozen、selection、editing、clipboard、undo/redo 等能力提供稳定入口。 |
| 示例与类型文档 | 在 README / Storybook 中说明 React 用法、生命周期约束、性能注意事项和可组合模式。 |

## 非职责

| 不做什么 | 原因 |
| --- | --- |
| 不实现引擎状态 | `DefaultGridEngine`、mutation、undo、view/raw 坐标、data source 协议属于 `@novasheet/core`。 |
| 不实现 Canvas 绘制 | renderer、painters、HighDPI、text measure 属于 `@novasheet/canvas2d`。 |
| 不绕过 `Grid` facade | 所有 mutation 必须经 `Grid` 或 `DefaultGridEngine` 的公开入口。 |
| 不读取 renderer 内部状态 | React 层只持有 public handle，不依赖 `Canvas2DRenderer` 或 painter 私有结构。 |
| 不硬编码视觉值 | 视觉值仍来自 core theme tokens；React 层只负责容器尺寸与业务 props。 |
| 不替代 Storybook 根应用 | `apps/storybook` 仍是 demo / variant showcase；React package 只提供可复用适配层。 |

## 依赖方向

```text
@novasheet/core      Grid facade · engine · DOM runtime · contracts
        ↑
@novasheet/canvas2d Canvas2D RenderBackend implementation
        ↑
@novasheet/react    React component/hooks adapter
        ↑
business apps       React applications
```

`@novasheet/react` 可以依赖 `@novasheet/core` 与 `@novasheet/canvas2d`。反向依赖禁止：core 和 canvas2d 不得 import React package。

## 架构（Bulletproof 适配）

源码按 [Bulletproof React](https://github.com/alan2207/bulletproof-react) 思想分层，并适配**可发布库**（非 SPA）：

| 层 | 路径 | 内容 |
| --- | --- | --- |
| 大组件 | `src/excel/` | `NovaExcel`（grid + toolbar 编排） |
| Feature | `src/features/grid/` | `NovaSheetGrid`、`useNovaSheetGrid` |
| Feature | `src/features/toolbar/` | `NovaSheetToolbar`、工具栏状态推导 |
| 共享 UI | `src/components/` | `Button`、`Input` primitive |
| 工具 | `src/lib/` | `cn` 等 |

详细规则见 [`docs/project-structure.md`](docs/project-structure.md)、[`docs/project-standards.md`](docs/project-standards.md)。依赖边界由 `bun run lint:react-boundary` 强制。

## 计划中的公开入口

当前包只建立边界与发布壳，尚未实现 React API。后续 API 应优先保持小而稳定：

| 入口 | 预期用途 |
| --- | --- |
| `NovaSheetGrid` | 默认 React 组件，负责 mount/destroy、container、backend 装配与基础 props diff。 |
| `useNovaSheetGrid` | hook 形式的低层适配入口，供业务组件自定义 DOM 与布局。 |
| `NovaSheetGridRef` | 暴露经过筛选的 imperative handle，例如 `scrollToCell`、`setColumnWidth`、`setFrozen`、`destroy`。 |
| `NovaSheetGridProps` | React 组件 props 类型，围绕 core `GridOptions` 收敛，不复制引擎协议。 |

## 已提供的公开入口

| 入口 | 用途 |
| --- | --- |
| `NovaSheetGrid` | React 版**普通表格**入口；不含工具栏，内部组合 core `Grid` 与 `canvas2dBackend`。 |
| `NovaExcel` | **开箱即用 Excel 组件**：`NovaSheetGrid` + `NovaSheetToolbar` + 内置 action 编排；默认 `SparseExcelDataSource` + `excelHeaders: true` + `excelWorkspace: true`（A–Z × 1000 无限稀疏单元格）。 |
| `useNovaExcelToolbar` | 低层 hook；从 `NovaExcel` 抽出的 toolbar ↔ Grid 编排，供自定义布局复用。 |
| `useNovaSheetGrid` | 低层 hook；返回 `containerRef` / `gridRef`，用于自定义布局。 |
| `NovaSheetGridRef` / `NovaExcelRef` | React ref handle；暴露 core `Grid` facade 和常用 imperative 方法。 |
| `NovaSheetToolbar` | 紧凑电子表格工具栏；可单独使用，由业务层接 `onAction`。 |
| `defaultToolbarItems` | 默认工具栏 item 顺序；用于测试、定制和业务侧 diff。 |
| `ToolbarAction` / `ToolbarActionId` | 工具栏 action 协议；业务层按 `id` 决定是否调用 `Grid` facade 或打开自定义面板。 |
| `NovaSheetToolbarState` | 受控展示状态，例如 `zoom`、`textWrap`。 |

`NovaSheetGrid` 是**不含工具栏**的 React 表格入口。它在 mount 时创建 core `Grid`，在 unmount
时调用 `destroy()`；`data`、`theme`、`frozen` 更新时走现有 `Grid` facade，不重新创建
实例。

```tsx
import { InMemoryDataSource } from '@novasheet/core'
import { NovaSheetGrid } from '@novasheet/react'

const data = new InMemoryDataSource({ /* schema + rows */ })

export function PlainGrid() {
  return <NovaSheetGrid data={data} className="h-[480px] w-full" />
}
```

`NovaExcel` 面向需要 Excel 风格、开箱即用的场景：默认 `SparseExcelDataSource`（省略 `data` 时自动创建）
+ `excelWorkspace: true` 无限单元格模式；内置工具栏与 Grid 之间的 undo/redo、
clipboard、fill、borders、merge、text-wrap 编排；默认开启 `excelHeaders`。

```tsx
import { SparseExcelDataSource } from '@novasheet/core'
import { NovaExcel } from '@novasheet/react'

const data = new SparseExcelDataSource()
data.updateCell(0, 'A', 'NovaSheet')
data.updateCell(999, 'A', 'edge content')

export function ExcelSheet() {
  return (
    <NovaExcel
      data={data}
      className="h-[560px] w-full"
      onToolbarAction={(action) => console.log(action.id)}
    />
  )
}

// 或省略 data，使用内部 SparseExcelDataSource + excelWorkspace
export function BlankExcel() {
  return <NovaExcel className="h-[560px] w-full" />
}
```

工具栏使用 Tailwind CSS class、CVA (`class-variance-authority`) 变体、`clsx` +
`tailwind-merge` 的 `cn` 工具，以及 shadcn/ui 风格的本地 `Button` / `Input`
primitive。`@novasheet/react` 不内置全局 CSS；消费方需要在应用构建中加载 Tailwind
CSS，并把 `packages/react/src/**/*` 或发布后的组件代码纳入 Tailwind content scan。

`NovaSheetToolbar` 首版不直接持有 `Grid`，也不直接调用 `setFillColor` / `setBorders`
等命令。它通过 `onAction({ id })` 把用户意图交给业务层；默认入口只覆盖当前已
实现的 undo / redo / clipboard / fill / border / merge / text-wrap 能力。

```tsx
import { NovaSheetToolbar } from '@novasheet/react'

export function SheetToolbar() {
  return (
    <NovaSheetToolbar
      state={{ zoom: '100%', textWrap: '溢出' }}
      disabledActionIds={['undo', 'redo']}
      onAction={(action) => {
        console.log(action.id)
      }}
    />
  )
}
```

## 实现约束

- 使用 `bun` 构建、测试和发布；不要使用 `npm` / `yarn` / `pnpm`。
- 使用 `bun:test` 编写测试；React 生命周期测试应覆盖 Strict Mode 下的重复 mount/destroy。
- 类型导入遵守 `verbatimModuleSyntax`，只读类型使用 `import type`。
- React 层只做适配，不新增跨包共享状态；每个 mounted grid 仍拥有自己的 scheduler/runtime/backend 实例。
- props diff 必须有明确规则：高频数据或大对象不要在 render path 深比较。
- 任何新增 public API 都应先在本 README 或设计文档中说明职责，再实现。

## 当前状态

`@novasheet/react` 是可构建、可发布的 React 适配包：

- Bulletproof 分层：`excel`、`features/grid`、`features/toolbar`、`components`、`lib`。
- 公开 API：`NovaSheetGrid`、`NovaExcel`、`NovaSheetToolbar` 及配套 hooks / types。
- 边界检查：`bun run lint:react-boundary`（根）或 `bun run --filter @novasheet/react lint:boundary`。
