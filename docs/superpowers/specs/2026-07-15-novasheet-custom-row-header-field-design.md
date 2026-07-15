# NovaSheet 自定义行头字段设计

- **日期**：2026-07-15
- **状态**：设计
- **分支**：`main`
- **范围**：Core frame 契约、Canvas2D 行头绘制、React Excel 门面

## 1. 问题

Excel 模式目前固定在最左侧行头显示 1-based 序号（`1、2、3...`）。业务表格常需要在同一位置显示随数据行移动的稳定标识，例如设备编码、指标编码或业务流水号。

目标数据已经包含该标识，调用方只需声明哪个字段用于行头：

```tsx
const data = new InMemoryDataSource({
  schema: {
    fields: [
      { id: 'name', name: '名称', type: 'text', width: 180 },
      { id: 'status', name: '状态', type: 'text', width: 120 },
    ],
  },
  rows: [
    { deviceCode: '设备-001', name: '电池组 A', status: '运行' },
    { deviceCode: '设备-002', name: '电池组 B', status: '停止' },
  ],
})

<NovaExcel data={data} rowHeaderField="deviceCode" excelWorkspace={false} />
```

`deviceCode` 不在 `schema.fields` 中，因此不成为正文列；它只作为行对象上的附加值供行头读取。

## 2. 目标

1. `NovaExcel`、`NovaSheetGrid` 和直接构造的 `Grid` 均支持 `rowHeaderField?: string`。
2. 设置后，Excel 行头从当前 view 行的指定字段读取标签。
3. 排序、筛选和行移动后，标签跟随对应数据行。
4. 未设置字段或字段值不可显示时，回退现有 1-based 序号。
5. 不改变未使用新选项时的 API、视觉和绘制行为。

## 3. 非目标

| 非目标 | 原因 |
| --- | --- |
| 自动计算行头宽度 | 宽度仍由 `theme.metrics.rowHeaderWidth` 控制，避免引入测量和布局变更 |
| 多字段模板或任意 formatter | 当前需求只需选择一个数据字段；后续确有组合标签需求再扩展 |
| 编辑行头标签 | 行头仍是选择、拖拽和菜单入口，不成为可编辑单元格 |
| 把行头字段加入 `schema.fields` | 该字段不应占用正文列或参与列结构操作 |
| 非 Excel 模式显示自定义行头 | `excelHeaders !== true` 时没有行头区域，新选项不生效 |

## 4. 公开 API

`GridEngineOptions` 增加可选字段，`GridOptions` 通过继承获得同一选项：

```ts
export interface GridEngineOptions {
  /** Excel 行头标签来源字段；缺省时显示 1-based 序号。 */
  readonly rowHeaderField?: string
}
```

React 的 `NovaSheetGridProps` 继承 `GridOptions`；`NovaExcelProps` 继承 `NovaSheetGridProps`，因此两者公开相同 prop：

```tsx
<NovaSheetGrid data={data} excelHeaders rowHeaderField="deviceCode" />
<NovaExcel data={data} rowHeaderField="deviceCode" />
```

字段名由调用方决定，不保留 `rowHeader`、`rowLabel` 等魔法 key。

## 5. 行为规则

| 条件 | 行头文本 |
| --- | --- |
| 未设置 `rowHeaderField` | `String(viewRowIndex + 1)` |
| 字段值为 `string` | 原样显示 |
| 字段值为有限 `number` | `String(value)` |
| 字段值为 `null` / `undefined` | 回退 1-based 序号 |
| 字段值为 `boolean` / `readonly string[]` / 非有限 number | 回退 1-based 序号 |
| `excelHeaders !== true` | 不绘制行头，忽略 `rowHeaderField` |

回退按当前 view 位置计算，保持现有序号语义。标签读取则使用 view 数据源，因此会跟随排序、筛选和行移动后的数据行。

## 6. 架构与数据流

### 6.1 Core

`Grid` 将 `rowHeaderField` 转发到 `DefaultGridEngine`。Engine 保存构造期选项，并在 `RenderFrame` 暴露：

```ts
export interface RenderFrame {
  // existing fields...
  readonly rowHeaderField?: string
}
```

`RenderFrame` 只携带字段选择器，不提前生成所有可见标签。这样不增加每帧数组分配，也不把 Canvas 文本规则放进 Core。

### 6.2 Canvas2D

`Canvas2DRenderer.paintRowHeaders()` 为 `RowHeaderPainter` 提供标签解析函数：

```ts
const resolveLabel = frame.rowHeaderField
  ? (viewRowIndex: number) => frame.data.getCell(viewRowIndex, frame.rowHeaderField!)
  : undefined
```

`RowHeaderPainter` 负责把受支持的值转成文本，并对缺失或不支持的值回退 `rowIndex + 1`。Painter 继续使用现有 clip、字体、颜色和选中态，不引入视觉常量。

Canvas2D 后端只读取 `RenderFrame` 及其 `data`，符合 renderer 不越过 frame 契约读取 engine 内部状态的架构约束。

### 6.3 React

`NovaSheetGrid` 和 `useNovaSheetGrid` 显式解构、转发 `rowHeaderField`，避免它落到宿主 `<div>` 形成无效 DOM attribute。该选项与 `excelHeaders` 一样属于构造期配置；运行时变更需要 remount Grid，本次不增加 setter。

`NovaExcel` 将 prop 原样传给 `NovaSheetGrid`。默认 `excelHeaders = true`，因此只需设置 `rowHeaderField` 即可启用自定义标签。

### 6.4 数据流

```text
rows[*].deviceCode
        |
        v
DataSource.getCell(viewRowIndex, "deviceCode")
        |
        v
RenderFrame.rowHeaderField
        |
        v
Canvas2DRenderer -> RowHeaderPainter -> 行头文本
```

排序或筛选装饰数据源负责 view→underlying 映射；Renderer 不重复做坐标转换。

## 7. 错误处理

| 情况 | 行为 |
| --- | --- |
| 字段不存在 | 对每行回退默认序号，不抛错 |
| 异步数据尚未加载 | `getCell()` 返回 `undefined`，本帧显示默认序号；`rowsChanged` 后重绘真实标签 |
| 标签超出行头宽度 | 沿用现有行头 clip；调用方通过 Theme 增大 `rowHeaderWidth` |
| 标签读取为空字符串 | 显示空字符串；空字符串是调用方提供的有效标签 |

## 8. BDD 与 TDD

### 8.1 BDD 外环

新增 Excel L3a 场景 `excel.L3a.custom-row-header-field`：

- Given：`NovaExcel` 接收包含 `deviceCode` 的数据，`rowHeaderField="deviceCode"`
- When：组件挂载并创建 Grid
- Then：选项进入 Grid 构造链，不落到宿主 DOM

Canvas 像素绘制属于 L4 白盒，不写进 L3 场景。

### 8.2 TDD 内环

| 层 | 失败测试先行 |
| --- | --- |
| Core frame | `rowHeaderField` 从 `GridEngineOptions` 进入 `RenderFrame`；缺省为 `undefined` |
| Canvas painter | string/number 标签绘制；缺失和不支持值回退 1-based 序号 |
| Canvas renderer | 从 `frame.data` 按 view row + `frame.rowHeaderField` 解析标签 |
| React hook | `rowHeaderField` 转发给 `Grid`，且不出现在宿主 DOM props |
| 回归 | 未设置选项时仍绘制 `1、2、3`，选中态与网格线顺序不变 |

## 9. 兼容性

| 现有用法 | 结果 |
| --- | --- |
| `<NovaExcel data={data} />` | 不变，显示 1-based 序号 |
| `<NovaSheetGrid excelHeaders data={data} />` | 不变，显示 1-based 序号 |
| `new Grid(..., { excelHeaders: false, rowHeaderField: 'id' })` | 不显示行头 |
| 自定义 DataSource | 只需现有同步 `getCell()` 能读取该字段，无新增接口 |

## 10. ADR

### ADR-A：字段选择器，而不是 formatter 回调

采纳 `rowHeaderField`。它与标签随数据传入的需求一致，API 可序列化，且排序、筛选后可直接复用 view DataSource 映射。formatter 回调更灵活，但会把标签逻辑拆到组件配置，并在绘制热路径执行调用方代码；当前没有该复杂度需求。

### ADR-B：不扩展 `DataSource.getRowHeader()`

自定义标签可由现有 `getCell(rowIndex, fieldId)` 表达。新增专用接口会扩大所有 DataSource 实现的契约，却没有带来当前需求所需的新能力。

### ADR-C：字段不要求出现在 Schema

采纳附加行值。`Schema.fields` 定义正文列；强制把行头字段加入 Schema 会导致它参与列绘制、重排、隐藏和删除，与行头语义冲突。

## 11. 实现切片

1. 新增并校验 Excel L3a 场景，建立行为测试红灯。
2. Core 选项与 `RenderFrame` 接线。
3. `RowHeaderPainter` 标签解析与回退。
4. `Canvas2DRenderer` 从 frame view data 读取字段值。
5. React props 转发与 DOM 泄漏回归测试。
6. 运行场景覆盖、定向测试、全量四门验证和代码审查。
