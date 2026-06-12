# NovaSheet 单元格扩展 API — 设计

- **日期**：2026-06-12
- **状态**：设计（待 user 复审 → BDD gate → writing-plans）
- **分支**：`main`（功能线开发前确认基线分支）
- **定位**：补齐 CLAUDE.md backlog「单元格自定义类型扩展 API」剩余能力：自定义 `FieldType`、backend-specific 单元格绘制、自定义编辑器、自定义筛选 UI。
- **前置**：
  - [`2026-06-10-novasheet-phase-5-c-value-formatting-design.md`](./2026-06-10-novasheet-phase-5-c-value-formatting-design.md)（formatter 轴已 ship）
  - [`2026-06-10-novasheet-bdd-tdd-method-design.md`](./2026-06-10-novasheet-bdd-tdd-method-design.md)（开发方法；本 feature 必须先过 BDD gate）
  - `packages/core/src/ARCHITECTURE.md`（core 纯层/DOM 壳边界）

---

## 1. 背景与目标

当前 `FieldType` 是闭合 union，仅内置 7 种类型；`CellPainter` 只有 `text` / `number` 专用路径，其余类型走 `String(value)` fallback；`DomCellEditor` 只有 input/textarea，只有 `text` / `number` 可编辑。5-C 已解决「raw value → display string」的 formatter 轴，但还不能扩展**显示形态**和**编辑控件**。

目标：

| 能力               | 目标                                                              |
| ------------------ | ----------------------------------------------------------------- |
| 自定义 `FieldType` | 业务可声明 `rating` / `progress` / `assignee` / `tag` 等任意类型  |
| 自定义绘制         | Canvas2D backend 可注册星级、进度条、tag、头像、按钮等绘制逻辑    |
| 自定义编辑         | DOM/React overlay editor 可注册 inline / popover / modal 编辑器   |
| 自定义筛选         | 自定义类型可注册 filter operator 语义与 filter editor UI          |
| 渐进增强           | 允许只注册 renderer/editor/type 任意一层；未注册时有稳定 fallback |

成功标准：

1. core 不依赖 canvas2d / React；绘制扩展只进 backend options。
2. React 永不参与 cell canvas 绘制，只参与 editor/filter editor overlay。
3. 所有编辑触发（双击、Enter/F2、直接键入、cell action、API）收敛为统一 `openCellEditor(ctx)` 流程。
4. 自定义类型未注册时文本 fallback 显示、不可编辑、不崩表。
5. 内置类型可被业务注册覆盖；业务扩展优先，未注册走 built-in。

---

## 2. 非目标

1. **不做 React cell renderer / DOM cell view**。React 不参与每个可见 cell 的绘制；以后也不提供 `createReactCellRenderer()`。
2. **不做 WebGL/WebGPU backend**。本 spec 只要求契约不阻碍未来 backend；实现先落 Canvas2D。
3. **不做运行时 register/unregister**。第一版只支持 `new Grid()` 构造期注册，生命周期内只读。
4. **不把编辑器塞进 backend**。编辑属于 DOM runtime / React adapter，不属于 Canvas2D/WebGL surface。
5. **不把 filter UI 塞进 type definition**。filter operator 语义和 filter editor UI 分离。
6. **不改变 DataSource 持有 schema 的事实**。schema 仍由 `DataSource.getSchema()` 提供，GridOptions 不新增 `schema`。

---

## 3. 总体 API

推荐分层：

```ts
new Grid(container, {
  data,

  // core 语义：backend-neutral
  cellTypes: {
    rating: ratingType,
    assignee: assigneeType,
  },

  // DOM runtime 编辑：backend-neutral
  cellEditors: {
    rating: ratingEditor,
    assignee: assigneeEditor,
  },

  // DOM runtime filter UI：backend-neutral
  cellFilterEditors: {
    assignee: assigneeFilterEditor,
  },

  // 绘制：backend-specific，Canvas2D/WebGL 各自实现
  backend: canvas2dBackend({
    cellRenderers: {
      rating: canvas2dRatingRenderer,
      assignee: canvas2dAssigneeRenderer,
    },
  }),
})
```

未来 WebGL 的形态：

```ts
new Grid(container, {
  data,
  cellTypes,
  cellEditors,
  cellFilterEditors,
  backend: webglBackend({
    cellRenderers: {
      rating: webglRatingRenderer,
      assignee: webglAssigneeRenderer,
    },
  }),
})
```

字段仍在 schema 内声明：

```ts
const schema = {
  fields: [
    { id: 'score', name: 'Score', type: 'rating', width: 120, options: { max: 5 } },
    {
      id: 'owner',
      name: 'Owner',
      type: 'assignee',
      width: 180,
      options: { source: 'team-members' },
    },
  ],
}
```

---

## 4. 类型扩展

### 4.1 FieldType

`FieldType` 从固定 union 放开为内置类型 + custom string：

```ts
export type BuiltInFieldType =
  | 'text'
  | 'number'
  | 'singleSelect'
  | 'multiSelect'
  | 'date'
  | 'checkbox'
  | 'url'

export type FieldType = BuiltInFieldType | (string & {})
```

规则：

| 情况               | 行为                                                                       |
| ------------------ | -------------------------------------------------------------------------- |
| 内置类型未覆盖     | 走当前 built-in 行为                                                       |
| 内置类型被业务注册 | 业务注册优先                                                               |
| custom type 已注册 | 按注册的 type/editor/renderer/filter 能力执行                              |
| custom type 未注册 | 文本 fallback 显示，不可编辑；clipboard/sort/filter 走安全 fallback 或禁用 |

### 4.2 CellTypeDefinition

`cellTypes` 描述数据语义，不含 DOM / Canvas / React：

```ts
export interface CellTypeDefinition {
  readonly editable?: boolean

  formatForEdit?(value: CellValue | undefined, ctx: CellTypeContext): string
  parseEditInput?(input: string, ctx: CellTypeContext): CellValue | null | undefined

  serializeClipboard?(value: CellValue | undefined, ctx: CellTypeContext): string
  parseClipboard?(text: string, ctx: CellTypeContext): CellValue | typeof SKIP

  sortValue?(
    value: CellValue | undefined,
    ctx: CellTypeContext,
  ): string | number | boolean | Date | null
  isEmpty?(value: CellValue | undefined, ctx: CellTypeContext): boolean

  readonly filterOperators?: readonly CellFilterOperator[]

  onAction?(ctx: CellActionContext): void
}

export interface CellTypeContext {
  readonly field: Field
  readonly locale: string
}
```

`parseEditInput` 只用于 inline/string draft；popover/modal editor 可直接 `commit(value)` 提交 typed value。

示例：

```ts
const ratingType: CellTypeDefinition = {
  editable: true,

  formatForEdit(value) {
    return value == null ? '' : String(value)
  },

  parseEditInput(input, ctx) {
    const max = Number(ctx.field.options?.max ?? 5)
    const n = Number(input.trim())
    if (!Number.isFinite(n)) return undefined
    return Math.max(0, Math.min(max, n))
  },

  serializeClipboard(value) {
    return value == null ? '' : String(value)
  },

  parseClipboard(text) {
    const n = Number(text.trim())
    return Number.isFinite(n) ? n : SKIP
  },

  sortValue(value) {
    return typeof value === 'number' ? value : null
  },
}
```

---

## 5. Filter Operator 与 Filter Editor

自定义 filter 分两层：

| 层   | API                                   | 职责                                    |
| ---- | ------------------------------------- | --------------------------------------- |
| 语义 | `cellTypes[type].filterOperators`     | 定义 operator、默认值、匹配函数、序列化 |
| UI   | `GridOptions.cellFilterEditors[type]` | 渲染和管理 operator 输入控件            |

```ts
export interface CellFilterOperator {
  readonly kind: string
  readonly label: string

  createDefaultValue?(ctx: CellTypeContext): unknown
  matches(value: CellValue | undefined, filterValue: unknown, ctx: CellTypeContext): boolean

  serialize?(filterValue: unknown): unknown
  deserialize?(raw: unknown): unknown
}

export interface CellFilterEditor {
  open(ctx: OpenCellFilterEditorContext): CellFilterEditorHandle
}
```

示例：

```ts
const assigneeType: CellTypeDefinition = {
  filterOperators: [
    {
      kind: 'assignee-is-any-of',
      label: 'is any of',
      createDefaultValue: () => [],
      matches: (value, filterValue) =>
        Array.isArray(filterValue) && filterValue.includes(String(value ?? '')),
    },
  ],
}
```

---

## 6. 编辑器契约

### 6.1 统一触发

所有进入编辑态的动作都收敛为 `openCellEditor(ctx)`：

```ts
export type CellEditTrigger =
  | 'double-click'
  | 'enter'
  | 'f2'
  | 'typing'
  | 'cell-click'
  | 'cell-action'
  | 'api'
```

```ts
export interface OpenCellEditorContext {
  readonly grid: Grid
  readonly cell: {
    readonly rowIndex: number
    readonly colIndex: number
    readonly field: Field
    readonly value: CellValue | undefined
    readonly rect: DOMRect
  }

  readonly trigger: CellEditTrigger
  readonly actionId?: string
  readonly initialInput?: string

  commit(value: CellValue | null): void
  cancel(): void
}

export interface CellEditor {
  readonly kind: 'inline' | 'popover' | 'modal'
  canOpen?(ctx: OpenCellEditorContext): boolean
  open(ctx: OpenCellEditorContext): CellEditorHandle
}

export interface CellEditorHandle {
  focus?(): void
  reposition?(rect: DOMRect): void
  close(reason: 'commit' | 'cancel' | 'blur' | 'destroy'): void
}
```

模式说明：

| kind      | 形态                       | 适用                                    |
| --------- | -------------------------- | --------------------------------------- |
| `inline`  | 编辑控件覆盖当前 cell rect | text、number、url、简单 rating          |
| `popover` | 编辑控件锚定在 cell 附近   | select、date、user picker、color picker |
| `modal`   | 编辑控件脱离 cell 布局     | 复杂表单、大文本、AI 生成配置           |

### 6.2 Action 默认流程

renderer 可声明 cell action hit zone。命中后 runtime 执行：

```text
hit cell action
→ cellTypes[type].onAction(ctx)
→ 未 preventDefault 则 open cellEditors[type] with trigger='cell-action'
→ 无 editor 则只选中 cell
```

```ts
export interface CellActionContext extends OpenCellEditorContext {
  preventOpenEditor(): void
}
```

checkbox 可覆盖为直接 toggle：

```ts
const checkboxType: CellTypeDefinition = {
  onAction(ctx) {
    ctx.commit(!ctx.cell.value)
    ctx.preventOpenEditor()
  },
}
```

---

## 7. Canvas2D Renderer 契约

绘制扩展只进入 backend options：

```ts
canvas2dBackend({
  cellRenderers: {
    progress: canvas2dProgressRenderer,
  },
})
```

```ts
export interface Canvas2DCellRenderer {
  paint(ctx: CanvasRenderingContext2D, params: Canvas2DCellRenderParams): void
}

export interface Canvas2DCellRenderParams {
  readonly value: CellValue | undefined
  readonly field: Field
  readonly rect: QuadrantRect
  readonly theme: Theme
  readonly rowIndex: number
  readonly colIndex: number
  readonly actions: CellActionRegistry
}

export interface CellActionRegistry {
  add(action: CellAction): void
}

export interface CellAction {
  readonly id: string
  readonly rect: QuadrantRect
  readonly cursor?: 'pointer' | 'text' | 'default'
  readonly label?: string
}
```

只注册 renderer 是合法用法：

```ts
new Grid(container, {
  data,
  backend: canvas2dBackend({
    cellRenderers: {
      progress: canvas2dProgressRenderer,
    },
  }),
})
```

该情况下：

| 能力        | 行为                                    |
| ----------- | --------------------------------------- |
| 显示        | 用 custom renderer                      |
| 编辑        | 无 editor，不可编辑                     |
| clipboard   | 无 `cellTypes` 时走默认 `String(value)` |
| sort/filter | 无 `cellTypes` 时走安全 fallback 或禁用 |

视觉约束：

| 代码位置                          | 规则                                                                                 |
| --------------------------------- | ------------------------------------------------------------------------------------ |
| NovaSheet 内置 renderer / painter | 仍必须只用 theme tokens                                                              |
| 外部业务 renderer                 | 可使用自有业务色值，但 params 必须提供 `theme`；推荐优先读 `theme` / `field.options` |

---

## 8. React Editor Adapter

React 不参与 cell 绘制，只提供 editor/filter editor adapter：

```ts
import { createReactCellEditor, createReactCellFilterEditor } from '@novasheet/react'

new Grid(container, {
  data,
  cellEditors: {
    assignee: createReactCellEditor(AssigneePicker, { kind: 'popover' }),
  },
  cellFilterEditors: {
    assignee: createReactCellFilterEditor(AssigneeFilter),
  },
})
```

React editor props：

```tsx
export interface ReactCellEditorProps<TValue = CellValue> {
  readonly value: TValue | undefined
  readonly field: Field
  readonly rowIndex: number
  readonly colIndex: number
  readonly trigger: CellEditTrigger
  readonly actionId?: string
  readonly initialInput?: string

  commit(value: TValue | null): void
  cancel(): void
}

export interface CreateReactCellEditorOptions {
  readonly kind: 'inline' | 'popover' | 'modal'
  readonly className?: string
  readonly closeOnBlur?: boolean
}
```

示例：

```tsx
function AssigneePicker({ value, commit, cancel }: ReactCellEditorProps<string>) {
  return (
    <div className="rounded border bg-white p-2 shadow">
      {['Alice', 'Bob', 'Carol'].map((user) => (
        <button key={user} onClick={() => commit(user)}>
          {user}
        </button>
      ))}
      <button onClick={cancel}>Cancel</button>
    </div>
  )
}
```

adapter 责任：

| 责任          | 说明                                                   |
| ------------- | ------------------------------------------------------ |
| mount         | 创建 overlay root，`createRoot()` 渲染 React component |
| position      | 根据 `ctx.cell.rect` 放到 inline/popover/modal 位置    |
| reposition    | scroll/resize/frame 变化时更新位置                     |
| commit/cancel | 调 core ctx，然后 unmount                              |
| destroy       | Grid destroy / editor close 时 `root.unmount()`        |

---

## 9. Data Flow

### 9.1 渲染

```text
DataSource.getSchema()
→ field.type
→ Canvas2DRenderer 查 backend cellRenderers[type]
→ 命中：custom renderer paint(ctx, params)
→ 未命中：内置 CellPainter / fallback text
```

renderer 只声明 action hit zone，不直接 mutation、不直接打开 DOM。

### 9.2 编辑

```text
double-click / Enter / F2 / typing / cell-action / API
→ runtime resolve cell + field.type
→ custom type onAction 可拦截
→ 查 cellEditors[type]；业务注册优先
→ built-in type 未注册 editor 时走 built-in editor；custom type 未注册 editor 时不可编辑
→ editor.open(ctx)
→ ctx.commit(value)
→ DefaultGridEngine / Grid facade mutation
→ invalidate
```

### 9.3 Filter

```text
header filter menu
→ field.type
→ cellTypes[type].filterOperators
→ cellFilterEditors[type] 打开 UI
→ apply operator + filterValue
→ FilterLayer 用 operator.matches() 判断
```

---

## 10. BDD Gate 候选场景

spec 批准后，先写/改场景，再进入 writing-plans。

| 层          | 场景 id                                            | 目的                                                           |
| ----------- | -------------------------------------------------- | -------------------------------------------------------------- |
| Core L0     | `core.L0.cell-extension-custom-type-fallback`      | custom type 未注册时文本 fallback、不可编辑                    |
| Core L0     | `core.L0.cell-extension-type-definition-contract`  | `parseEditInput` / clipboard / sort / filter operator 语义     |
| Core L2     | `core.L2.grid-custom-editor-open-triggers`         | 双击、Enter/F2、typing、API 收敛到统一 editor trigger          |
| Core L2     | `core.L2.grid-cell-action-opens-editor`            | cell action 先 `onAction`，未拦截打开 editor                   |
| Canvas2D L4 | `canvas2d.custom-cell-renderer-oplog`              | custom renderer 被调用并输出稳定 op-log（纯 TDD，不写 BDD MD） |
| React L3    | `excel.L3.custom-react-editor-commit-cancel`       | React editor adapter commit/cancel 生命周期                    |
| React L3    | `excel.L3.custom-react-filter-editor-apply-cancel` | React filter editor adapter apply/cancel 生命周期              |

说明：L4 renderer op-log 属渲染白盒，按方法论不写 BDD MD，只做 TDD。

---

## 11. ADR

### ADR-A：renderer 放 backend options，而不是 GridOptions

| 方案                                 | 结论 |
| ------------------------------------ | ---- |
| `canvas2dBackend({ cellRenderers })` | 采纳 |
| `GridOptions.cellRenderers`          | 拒绝 |

原因：renderer 是 backend-specific。Canvas2D renderer 需要 `CanvasRenderingContext2D`，WebGL renderer 需要 GPU draw command；把 renderer 放 `GridOptions` 会允许 Canvas renderer 误传给 WebGL backend，破坏 backend 替换边界。

### ADR-B：React 永不参与 cell 绘制

结论：不提供 `createReactCellRenderer()`，以后也不做 DOM/React per-cell view。

原因：

| 原因         | 说明                                                                                                       |
| ------------ | ---------------------------------------------------------------------------------------------------------- |
| 性能         | 可视区可能有几百到几千 cell；每格 React component 会带来 DOM 节点、reconciliation、layout/style/paint 成本 |
| 架构         | NovaSheet locked decision 是单 Canvas full visible-region redraw；React cell renderer 会引入第二套渲染树   |
| 交互         | 当前 hit-test 基于坐标和 frame；React cell view 会引入第二套事件系统                                       |
| backend 未来 | WebGL/WebGPU 无法复用 React renderer；会让 backend 抽象失效                                                |
| 复杂性       | 冻结区、合并、overflow、action hit zone 需要复制到 DOM 层，维护成本高                                      |

React 只参与「正在编辑的少数 overlay」和 filter editor，不参与「所有可见 cell 的绘制」。

### ADR-C：未注册 custom type fallback 显示、不可编辑

结论：custom type 未注册时不抛错，但也不 fallback 到 text editor。

原因：schema/文档可在插件缺失时打开，表格不崩；但不允许用户把未知业务类型随手编辑成 string，避免破坏数据语义。

### ADR-D：filter 语义与 filter UI 分离

结论：`cellTypes[type].filterOperators` 只定义语义；`GridOptions.cellFilterEditors` 提供 UI。

原因：matches/serialize/deserialize 可在 core 纯层测试；UI 可由 DOM runtime 或 React adapter 提供，不污染 pure core。

### ADR-E：构造期注册，生命周期内只读

结论：第一版不支持 `grid.registerCellType()` / `grid.setCellExtensions()`。

原因：运行时替换会影响 editor cleanup、renderer cache、action hit zones、filter menu 状态和 invalidation。第一版先保证契约稳定；业务需要换插件时重建 Grid。

---

## 12. 验收清单

1. design spec 经 user 复审。
2. BDD gate：场景 MD 定稿，`mbd validate` + manifest 通过。
3. implementation plan 首类任务让行为测试存在并红。
4. 一 task 一 commit；内环 TDD 红→绿。
5. 完整 gates：`bun run lint`、`bun run --filter '*' typecheck`、`bun test`、build 顺序通过。
