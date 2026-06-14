# Date-as-Serial Value Model Design

## 1. Problem

NovaSheet 当前把日期建模为 `CellValue` 的独立 `Date` 分支,各消费点(sort / filter / fill / clipboard / painter / formatValue)靠 `value instanceof Date` 嗅探值的 JS 类型来决定"日期性"。这与目标的 Google 表格类型模型不一致:Google 内部 date = number(自纪元起的序列号)+ date 格式,日期性是**类型/格式**属性而非值属性。

后续的 cell-level type override 特性(允许"一列多类型",对齐 Google 可观测行为)要求"日期性来自 resolved type 而非值嗅探"。在 `Date` 分支存在时这条路走不通。因此本 spec 先把值模型对齐为 serial number,作为 cell-type override 的干净底座。

本 spec 是两条 spec 的**第一条(前置)**;第二条 `cell-level-type-override` 在此基础上展开。

## 2. Goals

- `CellValue` 删除 `Date` 分支;日期物理存储为 serial number。
- 新增单一序列↔Date 转换器,纪元 **1899-12-30 = 0**,连续 proleptic Gregorian。
- 支持 **datetime**:整数=天,小数=日内时间。
- 日期性改由 **resolved type**(本期=列级 `field.type === 'date'`)决定,清除所有 `instanceof Date` 值嗅探。
- 迁移全部消费点(§4),可观测行为(显示/排序/筛选/填充/复制粘贴/编辑)保持不变。
- 输入侧**硬断 Date**:`setValue` / DataSource 构造 / paste 只收 serial(或可解析为 serial 的字符串)。

## 3. Non-goals

下一条 spec(`cell-level-type-override`):
- `CellTypeStore` / cell 级类型覆盖。
- 跨类型 sort 比较器(数字/日期 < 文本 < 布尔 < 空)。本期 date 仍按列类型走数值比较。
- fill 携带 type / `setCellType` / `clearCellType`。

YAGNI(明确不做):
- 按月/年的非线性日期填充(本期 date 填充 = 线性数值序列)。
- 时区显示配置:序列恒为时区中性 wall-clock。
- 超出 ISO 8601 + 显示 pattern 的 locale 感知解析。
- 复刻 Excel 1900 闰年 bug(按 Google,连续不闰)。

## 4. Architecture

### 4.1 Serial 核心 `kernel/protocol/serial.ts`

单一转换器,定为不变量:

- 纪元 **1899-12-30 = 0**;day 1 = 1899-12-31;连续 proleptic Gregorian,**不复刻 Excel 1900 闰 bug**(对齐 Google,非 Excel)。
- 整数部分 = 自纪元天数;小数部分 = 日内时间(`0.5` = 12:00:00)。
- **时区中性**:转换全程走 UTC(`Date.UTC` / `getUTC*`),严禁本地时区方法,否则跨时区/DST 差一天。
- 导出 `dateToSerial(d: Date): number`、`serialToDate(s: number): Date`。仅供内部转换/测试与输入边界解析用,**不进入 `CellValue`**。

### 4.2 日期性来源:类型,而非值

`value instanceof Date` 全部清除。日期性改查 resolved type:本期只需列级 `field.type === 'date'`(cell 级覆盖是下一条 spec)。

语义分层(与现有 `number 类型 + number 格式` 同构):
- **类型 `date`** 决定语义:sort rank、fill 递增、edit 解析、clipboard 序列化、painter 走日期显示路径。
- **valueFormat(列默认或 cell)** 决定 **pattern**;date 类型无显式 valueFormat 时,FrameAssembler 注入**默认 pattern `YYYY-MM-DD`**(date-only;datetime 显示须显式配 valueFormat 的 time token),避免裸序列露出。

### 4.3 消费点迁移映射

| 站点 | 现状 | 迁移后 |
|---|---|---|
| `CellValue` `Schema.ts` | 含 `Date` 分支 | 删 → `string \| number \| boolean \| null \| readonly string[]` |
| `formatValue` date kind | `new Date(value)`(误当 epoch ms) | `serialToDate(value)`;去 `instanceof Date`;datetime 加 `HH/mm/ss` pattern token |
| 默认 pattern | 无 | FrameAssembler:date 类型且无显式 valueFormat 时注入默认日期 pattern |
| `SortLayer.dateValue` | `instanceof Date ? getTime() : new Date(...)` | date 值已是 number,直接返回;去嗅探(跨类型 rank 留给下条 spec) |
| `FilterOp.date-between` | `Date \| null` | `number \| null`(serial);predicate 比 serial |
| `FilterPopover` 日期输入 | `<input type=date>` → Date | 解析 → `dateToSerial` |
| `FillSeries` date 投影 | `inferDateProjector` 嗅 `instanceof Date` | **删除**:date 是 number,线性日填充落进通用数值投影器;`cloneValue` 的 Date 分支一并去 |
| `TsvFormat` 序列化 | `v instanceof Date` → ISO | 值已是 number,copy 侧**需带列类型**:date 类型 → `serialToDate`→ISO,否则 `String(n)`;`serializeRowsToTsv` 加 field 类型入参 |
| `ApplyPaste.coerceForType` | 仅 number/checkbox/string | 加 `date` 分支:ISO 串 → serial;number 留 |
| edit `builtInCellTypes` | 仅 text/number,date 走 fallback ISO | 加 `date`:`formatForEdit`=serial→显示串,`parseEditInput`=ISO/pattern→serial |
| painter fallback / react / canvas2d | 部分嗅 `instanceof Date` | 编译器引导清掉;date 经 `formatCell` 渲染 |

### 4.4 输入硬断

`CellValue` 不含 `Date` 后,TS 自动在 `setValue` / DataSource 构造 / `defaultValue` / paste 等输入边界拒绝 `Date`。调用方/测试用 `dateToSerial(...)` 构造序列。不提供 Date→serial 的隐式输入强转(soft boundary 已否决)。

## 5. Data Flow

### 5.1 显示
`getCell` → serial number → `getFrame()` 构 `formatCell` 闭包 → date 类型取 valueFormat(或默认 pattern)→ `serialToDate` → `formatDatePattern` → painter 绘字符串。

### 5.2 编辑
打开:`formatForEdit(serial)` → `serialToDate` → 按 pattern 显示串入 overlay。提交:`parseEditInput(str)` 解析 ISO/pattern → `dateToSerial` → serial 写回(解析失败 → `SKIP_CELL_VALUE`)。

### 5.3 复制/粘贴
copy:`serializeRowsToTsv(rows, fieldIds, fieldTypes)` → date 类型 cell 的 number → `serialToDate`→ISO 串。
paste:`coerceForType(raw, 目标列 type)` → date 列 → ISO 串解析 → serial(转不动 → skip,沿用既有 `reason: 'type'`)。

### 5.4 排序/筛选
sort:date 列取 serial number 直接数值比较。filter:`date-between` 的 `min/max` 为 serial,predicate 比 serial。

### 5.5 填充
date 列序列即 number 序列;通用数值投影器按样本差做线性步进(`45000, 45001, ...` 天天递增天然成立)。

## 6. Error Handling

- `serialToDate`/`dateToSerial` 以有限数为前置条件(precondition),不内部兜底;调用点先 guard。`formatValue` date kind 已有 `asFiniteNumber` guard,对非 number/非有限值走 fallback 显示(沿用现有 null 路径),不调用 `serialToDate`。
- `parseEditInput` 解析失败 → `SKIP_CELL_VALUE`(不写回,沿用 number 类型语义)。
- paste 转不动 → skip cell,`reason: 'type'`(既有行为)。

## 7. Testing Strategy

BDD 外环 × TDD 内环(`docs/superpowers/specs/2026-06-10-novasheet-bdd-tdd-method-design.md`)。

**TDD 内环(纯算法,红先行):**
- `serial.ts`:day0=1899-12-30、day1=12-31、锚点(如 2026-01-01)、小数=时间(0.5=12:00)、round-trip、**跨 DST 用 UTC 不漂**、**不复刻 1900 闰 bug**(锚点选 1900-03 后双方一致区,或显式测分歧)。
- `formatValue` date:serial → 带 datetime token 的 pattern 输出。
- `SortLayer` / `FilterLayer` / `FillSeries` / `TsvFormat` / `CellEdit` / `CellPainter` 单测改 serial 输入,红先行。

**BDD 外环(更新现有场景,非新增;date→serial,期望显示不变):**
- `packages/core/tests/acceptance/e2e/grid/scenarios/L2-grid-format-value-number-currency-date.md`
- `packages/core/tests/acceptance/interaction/editing/scenarios/L0-fill-series-projection-matrix.md`、`L2-grid-fill-series-down-right.md`
- `packages/core/tests/acceptance/contract/file-format/scenarios/L0-clipboard-tsv-roundtrip.md`
- `packages/react/tests/excel/scenarios/L3b-value-format.md`

契约更新是本次重构的一部分(已批准的 `CellValue` 变更),非静默漂移;`mbd validate` + `lint:scenario-coverage` 不退化。

## 8. Migration

编译器引导大爆炸(hard-break 已选,双路径无意义):

1. 先改 `CellValue` 删 `Date` → TS 报错点即全部待迁移站点。
2. 按 §4.3 逐站点修到绿(subagent 一 task 一站点/一簇)。
3. 跨包:`@novasheet/core` 先构,`@novasheet/canvas2d`、`@novasheet/react` 后;`CellValue` 变更同时断两下游,统一迁移测试/story 的 `new Date(...)` → `dateToSerial(...)` 或字面 serial。

## 9. ADR

### ADR-A: Excel/Google serial days,非 Unix epoch ms
序列 = 自 1899-12-30 的天数(小数=时间)。对齐 Google/Excel 内部模型;fill "+1 天"=+1 自然;sort 序列直接比;未来 formula 引擎 DATE() 兼容。代价:边界加 serial↔Date 小转换层。否决 epoch ms(churn 虽小,但 fill 需特判 +86400000、数值非表格序列、与 Google 不一致)。

### ADR-B: 不复刻 Excel 1900 闰年 bug
按 Google 连续历法。代价:与期望 Excel 序列的参考会在 1900-03-01 前分歧;测试锚点规避或显式覆盖。

### ADR-C: 时区中性(UTC-based)
序列为 wall-clock,无时区。转换全程 UTC 方法,杜绝本地时区差一天。不提供时区显示配置(YAGNI)。

### ADR-D: 日期性 = 类型,非值
清除 `instanceof Date` 值嗅探,日期性来自 resolved type(本期列级 `field.type`)。为下一条 cell-level type override 提供前提;与 `number 类型 + number 格式` 分层同构。

### ADR-E: 输入硬断 Date
`CellValue` 与输入边界均不接受 `Date`;调用方用 `dateToSerial` 构造。模型唯一、无残留 Date;代价为测试/story churn。否决 soft boundary(Date 在输入边残留)。

## 10. Implementation Slices

1. `serial.ts` + 单测(纯 TDD,红先行)。
2. `formatValue` date kind → `serialToDate` + datetime token + 单测。
3. `CellValue` 删 `Date`(触发全仓 TS 报错,作为后续 slice 的导航)。
4. sort / filter(含 `FilterPopover`)迁移 + 测试。
5. fill(删 `inferDateProjector` / `cloneValue` Date 分支)+ 测试。
6. clipboard(`TsvFormat` 带类型序列化 + `ApplyPaste` date 强转)+ 测试。
7. edit(`builtInCellTypes` 加 date)+ 测试。
8. painter / FrameAssembler 默认 pattern 注入 + canvas2d/react 跨包修复 + story/test churn。
9. BDD 外环场景更新 + `mbd validate` + 全量 typecheck/lint/test/build 四绿。
