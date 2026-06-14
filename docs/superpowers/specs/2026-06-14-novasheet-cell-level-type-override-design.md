# Cell-Level Type Override Design

## 1. Problem

NovaSheet 当前以 `Field.type` 作为整列类型来源。该模型适合 Airtable 式结构化数据,也利于 AI/Schema 推断,但无法表达"一列多类型"的表格行为:同一列中某些单元格应按 number/date/text/boolean 的不同语义显示、编辑、排序、筛选;跨列 fill 时,源格的类型语义也应覆盖目标列默认类型。

Spec 1 (`date-as-serial`) 已把日期从 `CellValue.Date` 值分支迁移为 serial number,日期性不再靠 `value instanceof Date` 嗅探,为本 spec 的 `resolveCellType` 铺好底座。

本 spec 解决:

- cell 级类型覆盖:列默认 `Field.type` + 稀疏 per-cell override。
- fill 跨列 Google parity:值序列 + resolved 标量类型 + valueFormat 一起传播。
- edit / paint / sort / filter / paste 等消费点从 `field.type` 改为 resolved type。

## 2. Google Sheets Parity Baseline

Google Sheets 普通 sheet 更像"值 + 格式 + 数据验证/控件"模型,不是强列 schema。Google Tables 另有 column type,可选择 Number/Text/Date/Dropdown/Checkbox/Smart chips/None;列类型不匹配会提示错误或 warning。NovaSheet 选择保留 `Field.type` 作为结构化列默认,再新增 cell 级 override。

| 行为 | Google Sheets | NovaSheet 本 spec |
|---|---|---|
| 普通类型模型 | 无强列类型;range 可套 number/date/currency format | 保留 `Field.type`,新增 cell override |
| Google Tables | column type 可约束列,不匹配显示 warning | 不做 Tables parity |
| 输入后类型推断 | 可识别输入为 number/date 等 | 不推断;按当前 resolved type parse/coerce |
| 设置类型是否改值 | 改 format / validation / table column type 通常保留原值 | `setCellType` 只改 override,不改 value |
| fill 跨列 | 值/格式/日期数字序列一起传播 | 对齐:值序列 + resolved scalar type + valueFormat 一起传播 |
| dropdown/select | Data validation,可 reject 或 warning | 延后到 validation 线 |
| checkbox | cell/range 控件,可 custom checked/unchecked values | 本期只做 boolean type 语义,不做控件增强 |
| sort/filter | 官方未精确定义混合类型排序;filter 支持 condition/value/color | 本期定义固定 comparator;filter 采用 Option A |

参考:

- Google Help: Format numbers in a spreadsheet: `https://support.google.com/docs/answer/56470`
- Google Help: Automatically create a series or list: `https://support.google.com/docs/answer/75509`
- Google Help: Sort & filter your data: `https://support.google.com/docs/answer/3540681`
- Google Help: Use tables in Google Sheets: `https://support.google.com/docs/answer/14239833`
- Google Help: Create an in-cell dropdown list: `https://support.google.com/docs/answer/186103`
- Google Help: Add & use checkboxes: `https://support.google.com/docs/answer/7684717`

## 3. Goals

- 新增 cell 级类型覆盖: `resolveCellType(rawRow, rawCol, field) = CellTypeStore.get(rawRow, rawCol) ?? normalizeFieldType(field.type)`。
- 公开 view 坐标 API:
  - `Grid.setCellType(range, type)`
  - `Grid.clearCellType(range)`
  - `Grid.getCellType(rowIndex, colIndex)`
- 本期覆盖标量类型: `text` / `number` / `date` / `checkbox`。
- `setCellType` 只改类型覆盖,不转换、不清空、不推断 value。
- fill 跨列对齐 Google 可观测行为:值序列 + resolved 标量类型 + valueFormat 一起平铺;目标旧 type/format 被源 tile 覆盖。
- `RenderFrame` 下发 `resolveCellType` 闭包,renderer/runtime 不碰 raw store。
- edit / custom editor / action / display / autofit / sort / filter / paste 消费点改读 resolved type。
- undo/redo、row/col insert/delete/move 均能恢复或重映射 type store。

## 4. Non-goals

- 不实现 Google 普通 sheet 的输入自动类型推断。
- 不实现 Google Tables parity(column type UI、warning UI、table view、smart chips)。
- 不实现 `singleSelect` / `multiSelect` cell override;它们归 validation 线。
- 不实现 `url` 独立 cell override;列级 `url` 继续 text-like 行为。
- 不允许 `setCellType(..., customType)`;custom string type 归 custom-cell-type-extension-API。
- 不实现 per-cell checkbox 控件增强或 custom checked/unchecked values。
- 不改 `CellValue` 值域。

## 5. Type Scope

```ts
export type CellTypeOverride = 'text' | 'number' | 'date' | 'checkbox'
```

| 类型 | 本期行为 |
|---|---|
| `text` | 文本显示/编辑/paste;非空值可 String fallback |
| `number` | number parse/coerce;非法值显示 fallback,sort/filter 中视为不匹配或空 |
| `date` | serial number + date 默认 pattern;非法值 fallback |
| `checkbox` | boolean 语义;sort false < true;不含控件增强 |

`FieldType` 仍保留现有内置类型和 custom string。`CellTypeOverride` 是公开 API 的收窄参数,不等于完整 `FieldType`。

## 6. Architecture

### 6.1 CellTypeStore

新建 `packages/core/src/features/cell-types/CellTypeStore.ts`。

职责:

- 稀疏 raw cell map: key = `row:col`, value = `CellTypeOverride`。
- `set(range, type)`: 对 raw range 写覆盖。
- `clear(range)`: 清除 raw range 覆盖,回列默认。
- `get(row, col)`: 返回显式 override 或 `undefined`。
- `resolve(row, col, field)`: 返回 `get(row,col) ?? normalizeFieldType(field.type)`。
- `snapshot()` / `restore(snapshot)`: undo/redo 使用。
- row/col insert/delete/move remap:跟随 raw 坐标,与 format/merge/attachment 一致。

`normalizeFieldType` 规则:

| `field.type` | resolved default |
|---|---|
| `text` / `url` / unknown custom | `text` |
| `number` | `number` |
| `date` | `date` |
| `checkbox` | `checkbox` |
| `singleSelect` / `multiSelect` | `text` for this spec's scalar consumers |

说明:`singleSelect`/`multiSelect` 不进入 `CellTypeOverride`,但消费点需要一个标量 fallback;本期按 text-like 处理,validation 线再接真实 select 语义。

### 6.2 CellTypeController

新建 `packages/core/src/features/cell-types/CellTypeController.ts`。

职责:

- view range → raw range 翻译;非连续映射返回 `false`。
- `setCellType(range,type)` / `clearCellType(range)` 正向写入。
- 快照前后一致则返回 `false`,不入 undo。
- 入栈 `cellType` undo command,记录 before/after snapshot + selectionBefore/selectionAfter。
- 不写 value,不碰 format store。

### 6.3 Undo

新增 `cellType` undo command:

```ts
{
  kind: 'cellType'
  before: CellTypeSnapshot
  after: CellTypeSnapshot
  selectionBefore: GridSelection
  selectionAfter: GridSelection
}
```

新增 `CellTypeUndoHandler`,undo/redo 只 restore type store + selection。fill / structural mutation 仍在各自 undo command 中携带 type snapshots,避免把一次用户操作拆成多条 undo。

### 6.4 RenderFrame 通道

`RenderFrame` 新增闭包:

```ts
resolveCellType?: (rowIndex: number, colIndex: number, field: Field) => CellTypeOverride
```

输入为 view 坐标。`FrameAssembler` 内闭合 `viewRowToRaw` / `viewColToRaw` / `CellTypeStore`,renderer/runtime 遍历时调用,不读取 raw store。

不采用 `resolvedCellTypes[]` 列表,因为:

- painter/runtime 已有 row/col/field。
- 闭包避免为可见区构造额外数组。
- 与 `formatCell` 现有热路径形态一致。

### 6.5 Display / formatValue

`buildFormatCell` 改为:

1. cell valueFormat > field.format > default by resolved type。
2. resolved type 为 `date` 且无显式 valueFormat → 默认 `{ kind: 'date', pattern: 'YYYY-MM-DD' }`。
3. resolved type 从 `date` 改为 `number/text/checkbox` 后,不再吃列级 date 默认 pattern。

非法值行为:

| resolved type | 非法 value 显示 |
|---|---|
| `number` | `formatValue` 返回 undefined,painter fallback `String(value)` |
| `date` | 非 finite number fallback |
| `checkbox` | 非 boolean fallback |
| `text` | text fallback |

### 6.6 Edit / custom editor / action

所有编辑入口按 resolved type 查注册表:

- `EditController.beginCellEdit`
- `EditController.commit`
- `GridRuntime.openCustomCellEditor`
- `GridRuntime.hasCustomCellEditor`
- `GridRuntime.invokeCellAction`

传给 editor/action 的 `field` 使用 view object: `{ ...field, type: resolvedType }`。`field.id` / `field.name` / `field.options` 保持列定义,但 `type` 表达当前单元格语义。

`setCellType` 不做 value coercion;编辑提交时才按 resolved type parse。非法输入继续返回 `SKIP_CELL_VALUE`。

### 6.7 Paste

paste 按目标格 resolved type coerce:

- `ApplyPaste` 接收 target cell resolved type resolver。
- 每格取 `(targetRow,targetCol,field)` 的 resolved type。
- `source.typed === true` 保持现有语义:内部 typed cache 已是 `CellValue`,值原样写;type 不随 paste 传播。
- 非 typed TSV paste 按目标 resolved type coerce;失败 skip,`reason: 'type'`。

### 6.8 Fill parity

fill 是本 spec 的 Google parity 强约束:

```text
fill parity scope = value series + resolved scalar type + valueFormat
validation / dropdown / controls / custom chips deferred
```

规则:

| 场景 | 行为 |
|---|---|
| 源格有值 + resolved type + valueFormat | 目标复制/外推值,同时复制源 tile 的 resolved type 与 valueFormat |
| 源格是 date/number series | 目标值继续 series;目标 type 也变成源格 resolved type |
| 源格无显式 override,只是列默认 type | 目标仍写入必要 override,让目标最终 resolved type 等于源格 |
| 目标已有 type/valueFormat | 被源 tile 覆盖;源无对应格式则清掉目标旧格式 |
| source/fill view→raw 非连续 | 保守跳过 type/format propagation,值写入维持既有行为 |

实现:

- `FillStyleSnapshots` 扩展 `cellTypeBefore` / `cellTypeAfter`。
- `FillStylePropagator` 注入 `CellTypeStore` 与 resolver。
- 新增 `tileFillType(rawSource, rawFill, direction)`:
  - 清目标 type override。
  - 按源 tile 的 resolved type 逐格写目标 override。
  - 若目标列默认已等于源 resolved type,可选择不写显式 override;但必须保证最终 resolved type 相等。

### 6.9 Sort

排序 spec 仍按 fieldId。比较器按每行 sorted upstream row 的 resolved type + value 排序。

固定混合类型顺序:

```text
number/date < text < boolean < empty
```

- `date` 与 `number` 同 rank,比较 serial number。
- empty 恒末尾,升降序都不翻转。
- 降序只反转前三类内部与类间顺序;empty 仍末尾。
- 非法值按当前 resolved type 视为空。
- 稳定性沿用 row index tie-break。

### 6.10 Filter

本期采用 Option A:

- filter operator 菜单/合法性仍按列默认 `field.type` 门控。
- predicate 跑实际值;当 predicate 需要类型解释时可用 resolved type。
- 这意味着 mixed 列不会获得完整 Google "filter by values" parity。

全面 Google filter parity 独立为 FilterParity 线。

### 6.11 Structural mutations

row/col insert/delete/move 时,`CellTypeStore` 跟随 raw 坐标 remap:

- 插入:受影响坐标平移。
- 删除:删除被移除行/列上的 overrides,幸存坐标压缩。
- 移动:用 indexMap remap。

结构 undo command 扩展携带 cell type snapshots,与 format/merge snapshots 同步恢复。

## 7. Public API

```ts
grid.setCellType(range: CellRange, type: CellTypeOverride): boolean
grid.clearCellType(range: CellRange): boolean
grid.getCellType(rowIndex: number, colIndex: number): CellTypeOverride
```

坐标均为 view 空间,对齐 selection 与 `setValueFormat`。后续若 raw 插件需要,另加 raw API;本期不做。

## 8. Data Flow

### 8.1 Display

`getCell` → raw value → `frame.resolveCellType(viewRow,viewCol,field)` → valueFormat resolution → `formatCell` → painter display string。

### 8.2 Edit

open: view cell → resolved type → built-in/custom editor → formatted draft。

commit: draft → resolved type parser → `CellValue` or skip → existing `commitCellValue` write path。

### 8.3 Fill

source/fill view range → raw range → value series writes → format/type propagation snapshots → single `fill` undo command。

### 8.4 Paste

clipboard cells → per-target resolved type coerce → data write;type store unchanged。

### 8.5 Sort/filter

view layer wraps data source;resolver maps upstream row/field to raw cell type. Comparator/predicate never reads `CellTypeStore` directly outside injected resolver.

## 9. Error Handling

- `setCellType` unknown type → TypeScript 拦截;runtime guard 返回 `false`。
- `setCellType` over non-contiguous view→raw range → `false`,不写 store。
- `setCellType` on unsupported scalar target? 不存在:API type 已收窄。
- `setCellType` 不转换 value;非法值保留。
- edit parse fail → `SKIP_CELL_VALUE`,不写回。
- paste coerce fail → skip cell,`reason: 'type'`。
- missing field / out-of-range `getCellType` → fallback `text`。

## 10. Testing Strategy

BDD 外环 × TDD 内环,遵循 `docs/superpowers/specs/2026-06-10-novasheet-bdd-tdd-method-design.md`。

### 10.1 BDD scenarios

| 层 | 场景 | 目的 |
|---|---|---|
| L0 | `core.L0.cell-type-store-raw-remap` | `CellTypeStore` set/clear/resolve/snapshot/remap |
| L2 | `core.L2.grid-cell-type-override-api` | `Grid.setCellType/clearCellType/getCellType` view 坐标行为 |
| L2 | `core.L2.grid-fill-type-format-propagates` | fill 跨列传播 value series + resolved type + valueFormat |
| L2 | `core.L2.grid-cell-type-edit-display` | date override 默认 pattern、number/date edit parse |
| L2 | `core.L2.grid-cell-type-sort-mixed` | mixed comparator 顺序 |
| L2 | clipboard paste scenario 扩展 | paste 按目标 resolved type coerce,不携带源 type |

### 10.2 TDD unit / integration

| 测试 | 覆盖 |
|---|---|
| `CellTypeStore.test.ts` | raw map、range write、clear、snapshot restore、row/col remap |
| `CellTypeController.test.ts` | view→raw、undo command、non-contiguous view range false |
| `DefaultGridEngine.cell-types.test.ts` | facade API、frame resolver、structural undo/remap |
| `DefaultGridEngine.fill-types.test.ts` | source resolved type 覆盖目标 type,undo/redo 恢复 |
| `SortLayer.test.ts` | mixed comparator、empty last、date/number rank |
| `FilterLayer.test.ts` | Option A 门控 + predicate 实际值 |
| `ApplyPaste.test.ts` | target resolved type coerce |
| `EditController.test.ts` / runtime tests | resolved type editor/registry lookup |

### 10.3 Gates

```bash
bun run lint
bun run --filter '*' typecheck
bun test
bun run --filter @novasheet/web build && bun run --filter @novasheet/canvas2d build && bun run --filter @novasheet/core build
```

## 11. Migration / Implementation Slices

1. BDD scenario gate:新增/扩展场景 + `mbd validate` + manifest。
2. `CellTypeOverride` + `CellTypeStore` + TDD。
3. `CellTypeController` + `cellType` undo handler + public engine/facade API。
4. `RenderFrame.resolveCellType` + `FrameAssembler` default date pattern 改 resolved type。
5. edit / custom editor / action registry 按 resolved type。
6. paste 按 target resolved type。
7. fill type propagation + undo/redo snapshots。
8. sort mixed comparator + filter Option A。
9. structural mutation remap + structural undo snapshots。
10. canvas2d/react/runtime test churn + full gates。

## 12. ADR

### ADR-A: 保留 `Field.type`,新增 cell override

Google 普通 sheet 弱类型;NovaSheet 需要列级结构服务 AI/数据工作台。采用 `Field.type` 作列默认,`CellTypeStore` 作 cell 级覆盖,兼顾结构化和混合格行为。

### ADR-B: `setCellType` 不做 value coercion

类型覆盖是语义 metadata mutation,不隐式改用户数据。非法值保留并由显示/排序/筛选/编辑路径处理。这样 undo 粒度清晰,也避免批量转换造成不可预期数据损失。

### ADR-C: fill 跨列对齐 Google,类型与格式一起传播

用户拖拽填充时预期"源格长什么样/怎么解释"一起带过去。本期 parity scope 明确为 value series + resolved scalar type + valueFormat。validation/dropdown/control/custom chip 作为后续 parity 缺口接入同一传播机制。

### ADR-D: `RenderFrame.resolveCellType` 用闭包而非列表

闭包与 `formatCell` 形态一致,renderer 不碰 raw store,也避免构造完整可见区 type 数组。代价是遍历时多一次函数调用;相比 painter 工作量可接受。

### ADR-E: `CellTypeStore` 不放进 `FormatState`

type 是语义域,不是视觉格式。单独 store/controller/undo handler 边界更清晰;fill 可以同时注入 format store 与 type store 做一次用户操作的统一传播和 undo。

### ADR-F: select/dropdown/custom 延后

Google dropdown 是 Data validation,checkbox custom values 也是 validation。`singleSelect`/`multiSelect`/custom string type 若塞进本 spec,会引入 choices、非法值策略、editor 控件、validation UI。先落标量 override,后续 validation/custom-type API 复用同一 `resolveCellType` 底座。
