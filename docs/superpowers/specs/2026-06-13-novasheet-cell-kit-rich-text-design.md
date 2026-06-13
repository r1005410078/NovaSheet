# NovaSheet cell-kit 基础组件包 + 附件数据轴 + rich-text — 设计

- **日期**：2026-06-13
- **状态**：设计（待 user 复审 → BDD gate → writing-plans）
- **分支**：`main`（功能线开发前确认基线分支）
- **定位**：在已有「单元格扩展缝」上补三块增量——① 第一方基础组件包 `@novasheet/cell-kit`（默认不进 core/react，显式注册，和外部扩展走同一公开缝）；② core 新增**附件数据轴** `CellAttachmentStore<T>`（承载不属于 value 的 per-cell 私有数据）；③ rich-text 作为这条缝的**首个非值类型消费者**。
- **前置**：
  - [`2026-06-12-novasheet-cell-extension-api-design.md`](./2026-06-12-novasheet-cell-extension-api-design.md)（**缝基线**：自定义 type / 显示 / 编辑 / 筛选轴。本文档构建其上，复用其 `Canvas2DCellRenderer`、`openCellEditor`、React adapter 契约，不重设计）
  - [`2026-06-10-novasheet-phase-5-c-value-formatting-design.md`](./2026-06-10-novasheet-phase-5-c-value-formatting-design.md)（formatter 轴已 ship）
  - [`2026-06-10-novasheet-bdd-tdd-method-design.md`](./2026-06-10-novasheet-bdd-tdd-method-design.md)（本 feature 须先过 BDD gate）
  - `packages/core/src/ARCHITECTURE.md`（core 纯层/DOM 壳边界，不变量 #9）

---

## 1. 背景与目标

工具栏字体组（字号 −/+、B、I、删除线、文字颜色，截图所示）是 Google/Excel 的基础文本能力，NovaSheet 当前 `CellFormat`（`fillColor`/`borders`/`textWrap`/`valueFormat`）全无，painter 只读 theme 全局 `colors.text` + `metrics.fontSize/fontFamily`，无 per-cell typography 通道。

2026-06-12 缝服务的是「**新值类型**」（`rating` 是个 number、`assignee` 是个 string）——`CellTypeDefinition` 管 value 语义。rich-text 暴露了它的缺口：rich-text **不是新值类型**，而是 `'text'` 上的**跨字符样式覆盖**，runs 不属于 value（同一字符串可有任意分段格式），现有缝**载不动**。

**关键洞察**：缝缺一条「不属于 value 的 per-cell 辅助数据」轴。这就是本文档的核心增量 `CellAttachmentStore<T>`。rich-text 是它的第一个消费者；将来富链接、单元格批注、AI 标注等同类「附着在格上但非值」的能力都复用它。

目标：

| 增量 | 目标 |
| --- | --- |
| 附件数据轴 | core 提供泛型、语义无关的 per-cell 附件存储，remap/fill/clipboard/undo 复用 `RangeStyleStore` 已验证逻辑；扩展只注册 namespace + codec |
| cell-kit 包 | 第一方基础组件单独成包，**默认不进** `@novasheet/core`/`@novasheet/react`；用的人显式 `import` + 注册；仅依赖三层的**已发布 API**（dogfooding：拼不出 = 缝有缺口） |
| rich-text | 字体组（B/I/U/删除线/字号/字体族/颜色）的 per-cell 子串异格：数据模型 + styled-text 渲染 + contenteditable 编辑器 + 浮动工具栏 |

成功标准：

1. core/canvas2d/react 默认入口**零注册基础组件**——默认 Grid 渲染纯文本/数字，要 B/I/runs 必须显式注册 cell-kit。
2. `@novasheet/cell-kit` 仅用 core/canvas2d/react 的已发布 API 拼出 rich-text，无任何内部特权通道。
3. core 永不识别 `TextRun` 语义——只存 opaque 附件 + 调 codec。
4. core 不含任何 typography 字段（见 §2 非目标 1 与 ADR-B）。
5. 附件随 fill/sort/插删行**正确跟随 raw cell**，无 off-by-one。

---

## 2. 非目标（YAGNI）

1. **core `CellFormat` 不加 typography 字段**。本会话曾议「混合：range typography（`CellFormat.text`）+ per-cell runs」——其 range 级那半会往 **core** 塞 typography = 默认带 + 污染 core，与「默认不带、dogfooding」直接冲突，**否决**（见 ADR-B）。全部 typography 走 rich-text attachment。
2. **不做 range 级整列加粗的单 layer 优化**。「选区加粗」第一版 = 选区内逐格写 full-span run（有限选区 OK）。「无限列单 layer 加粗」留作后续（真要时让 attachment 支持 range 默认层）。
3. **不做 hyperlink / 富链接 run**。Google 有，但截图工具栏无；本批 run 属性集止于字体组。
4. **不做对齐 / 垂直对齐 / 文本旋转**。它们是 cell 级、与字体组正交，本批不碰。
5. **不拆 3 包**。当前单后端单框架，单包 `@novasheet/cell-kit` 内部分 renderer/editor/codec 模块即可；将来上 WebGL/vanilla 壳再拆，纯机械搬迁。
6. **不做运行时 register/unregister**。沿用 2026-06-12 ADR-E：构造期注册，生命周期内只读。
7. **不实现 star-rating**。它只作设计压力的第 2 消费者（引用 2026-06-12 `rating` 例），验证缝通用性，不落代码。

---

## 3. 设计原则：dogfooding + 默认不带

| 层 | 缝带什么 | 默认注册扩展？ |
| --- | --- | --- |
| `@novasheet/core` | `CellAttachmentStore<T>` + namespace 注册 + remap/fill/clipboard/undo + `Grid.setCellAttachment`（公开 API） | **零** |
| `@novasheet/canvas2d` | renderer 注册表（2026-06-12 已定）+ paint-params attachment accessor + 导出 styled-text 绘制原语；保留 plain text/number 原始渲染 | **零** |
| `@novasheet/react` | editor adapter 缝（2026-06-12 已定）+ 导出可复用 overlay/toolbar 原语 | **零** |
| `@novasheet/cell-kit`（新，第一方） | `richTextExtension` = type + renderer + editor + codec，**仅依赖上三者已发布 API**，组合根显式注册 | **opt-in** |

默认 `@novasheet/react` 渲染纯文本/数字；想要字体组，得 `import { richTextExtension } from '@novasheet/cell-kit'` 并注册——和外部第三方扩展**完全同一条路径**。第一方包就是「典范外部扩展」：它的依赖形状（renderer 需 canvas2d、editor 需 react、codec 需 core）正是任何外部作者也会有的。

---

## 4. `@novasheet/cell-kit` 包

### 4.1 拓扑

单包，内部按层分模块：

```
packages/cell-kit/
  src/
    rich-text/
      richTextCodec.ts        # 依 core：TextRun (de)serialize、namespace='richText'
      richTextRenderer.ts     # 依 canvas2d：Canvas2DCellRenderer，读 attachment 切段
      RichTextCellEditor.tsx  # 依 react：contenteditable + FloatingFormatToolbar
      index.ts                # 组装 richTextExtension
    index.ts
```

### 4.2 依赖

```
@novasheet/cell-kit → @novasheet/core + @novasheet/canvas2d + @novasheet/react
```

纯 leaf consumer，依赖图顶端，无环（`core ← canvas2d ← react ← cell-kit ← apps/storybook`）。`react` 作 peer（与 `@novasheet/react` 一致）。

### 4.3 扩展装配形态

`richTextExtension` 不是单一对象——是三层贡献的协调集合，组合根分别喂给对应注册点：

```ts
import { richTextExtension } from '@novasheet/cell-kit'

new Grid(container, {
  data,
  cellAttachments: [richTextExtension.codec],        // core 轴：注册 'richText' namespace
  cellEditors: { text: richTextExtension.editor },   // 编辑轴：覆盖 'text' 编辑器
  backend: canvas2dBackend({
    cellRenderers: { text: richTextExtension.renderer }, // 显示轴：覆盖 'text' 渲染
  }),
})
```

**注意**：rich-text 覆盖的是内置 `'text'` 类型（按 2026-06-12 §4.1「内置类型被业务注册优先」），**不是**新 `FieldType`——它给 text 加跨字符样式，值仍是 string。这正是它区别于 rating/assignee 的本质，也是为何只有它需要 attachment 轴。

### 4.4 包配置成本（一次性）

`package.json`（deps/build/typecheck/exports，照搬 react）、`tsconfig`、build 配置、`tests/` 镜像目录、README，并在 `scripts/check-kernel-boundary.ts`（或新增 boundary check）加规则：禁止 core/canvas2d/react **反向**依赖 cell-kit。

---

## 5. 附件数据轴 `CellAttachmentStore<T>`（core 增量）

### 5.1 契约

落 `packages/core/src/features/attachment/`：

```ts
/** 语义无关的 per-cell 附件存储。core 不识别 T 的含义，只存 opaque + 调 codec。 */
export interface CellAttachmentStore {
  get<T>(namespace: string, rawRow: number, rawCol: number): T | undefined
  set<T>(namespace: string, rawRow: number, rawCol: number, data: T | undefined): void
}

/** 扩展注册的 namespace + 序列化器（clipboard / 持久化用）。 */
export interface CellAttachmentCodec<T> {
  readonly namespace: string
  serialize(data: T): string
  deserialize(text: string): T | undefined
}
```

注册：`GridOptions.cellAttachments?: readonly CellAttachmentCodec<unknown>[]`（backend-neutral，core 持有）。

### 5.2 raw-key + remap/fill/clipboard/undo

附件**按 raw 行列键控**（与 `RangeStyleStore`/`MergeStore` 同），**复用其已验证的结构 remap 逻辑**（不重造、不碰 off-by-one）：

| 关注点 | 行为 |
| --- | --- |
| 结构 remap | 插删行/列经 `FormatEventHandler` 同款路径委派 remap raw key |
| fill 携带 | fill 柄携带附件（延续 `bb015ed` 携带 textWrap/valueFormat 的对齐 Google 决定）；sort/filter 打散时保守 no-op |
| clipboard | copy 经 codec `serialize`，paste 经 `deserialize`；跨 Grid/外部安全降级 |
| undo | `set` 经写门面入 undo 栈，快照对比同 format |
| sort/filter | 附件跟 raw cell（view-level sort 不动 raw，附件天然跟随） |

### 5.3 渲染读取通道

renderer 经 paint params 读附件（view→raw 映射内部完成）。扩展 2026-06-12 §7 `Canvas2DCellRenderParams`：

```ts
export interface Canvas2DCellRenderParams {
  // ...2026-06-12 既有字段...
  getAttachment<T>(namespace: string, rowIndex: number, colIndex: number): T | undefined
}
```

### 5.4 写入门面

```ts
// Grid facade
setCellAttachment<T>(namespace: string, rawRow: number, rawCol: number, data: T | undefined): void
```

含 undo；编辑器提交、工具栏 apply 都经此。

---

## 6. rich-text 数据模型（cell-kit，存于 attachment）

```ts
export interface TextRunAttrs {
  readonly bold?: boolean
  readonly italic?: boolean
  readonly underline?: boolean
  readonly strikethrough?: boolean
  readonly fontSize?: number       // undefined = 继承 cell 默认（theme）
  readonly fontFamily?: string
  readonly color?: string
}

/** 半开 [start, end)，UTF-16 code-unit 偏移（对齐 contenteditable Selection）。 */
export interface TextRun {
  readonly start: number
  readonly end: number
  readonly attrs: TextRunAttrs
}

/** normalized：按 start 升序、互不重叠；gap = 继承 cell 默认。空数组 = 无 run。 */
export type RichTextValue = readonly TextRun[]
```

存 `CellAttachmentStore` 的 `'richText'` namespace，value = `RichTextValue`。core 只见 opaque + `richTextCodec`。

---

## 7. 渲染（canvas2d 原语 + cell-kit renderer）

### 7.1 canvas2d styled-text 绘制原语（新增公开导出）

`CellPainter` 抽出按段绘制能力，built-in 文本 = 单段，rich-text = 多段。**只动 canvas2d，不动 core。**

```ts
export interface StyledSegment {
  readonly text: string
  readonly font: string           // 已解析 CSS font 串（含 weight/style/size/family）
  readonly color: string
  readonly underline?: boolean
  readonly strikethrough?: boolean
}

/** 按段绘制，复用现有 wrap/overflow/clip/省略号布局；underline/strike 手绘线段。 */
export function paintStyledText(
  ctx: CanvasRenderingContext2D,
  segments: readonly StyledSegment[],
  layout: StyledTextLayout,
): void
```

- underline/strike：Canvas 无原生 text-decoration，按段 `measureText` 起止 x + 基线偏移**手绘线段**；线宽/偏移读 theme 新增 token（不变量 #4 禁硬编码）。
- 混排行高：按段内**最大 fontSize** 括高；wrap/measure per-segment。
- 内置单段路径走同一 `paintStyledText`，零回归（单段 = 现行为）。

### 7.2 rich-text renderer（cell-kit）

`Canvas2DCellRenderer`（注册到 `'text'`）：

```text
paint(ctx, params):
  runs = params.getAttachment<RichTextValue>('richText', rowIndex, colIndex)
  display = 解析显示串（仅当显示 = raw string，见 §9）
  若 runs && display 为 raw string:
    segments = 切段(display, runs, cellDefault = theme typography)
  否则:
    segments = [单段(display, cellDefault)]
  paintStyledText(ctx, segments, layout)   // wrap/overflow/clip 复用 core 导出 wrapText + measurer
```

cell 默认 attrs = theme typography（fontSize/fontFamily/colors.text）；段 attrs = `cellDefault ⊕ run.attrs`。

### 7.3 theme 新增 token

`ThemeMetrics` 或新 `ThemeText`：underline 线宽 + 基线下偏移、strike 线宽 + 基线偏移。denseGridTheme 补默认值。

---

## 8. 编辑（cell-kit，React）

### 8.1 RichTextCellEditor

经 2026-06-12 §8 React editor adapter 缝注册（`kind: 'inline'`）：

- contenteditable `<div>`，用 `runs → <span style>` 回填初值。
- 提交：遍历 DOM → normalized `RichTextValue` + plain text；规范化合并相邻等格段。
- plain text 写 value（经既有 commit 路径），runs 经 `Grid.setCellAttachment('richText', rawCell, runs)` 写 store（含 undo）。

### 8.2 FloatingFormatToolbar

截图那条：字号 −/+、B、I、U、删除线、颜色 A。作用于**当前 DOM Selection**——选中子串 toggle 对应 attr（Selection API 包/拆 span，不依赖废弃 `execCommand`）。全选已 bold → 再点取消（toggle 语义）。

### 8.3 复用 react 导出原语

浮动定位、颜色选择器复用 `@novasheet/react` 已有 overlay/toolbar 原语（参见 `2026-06-11-toolbar-custom-color-picker-design.md` 的 color picker）。

---

## 9. 交互规则

| 规则 | 决定 |
| --- | --- |
| valueFormat × runs | runs **仅在显示 = raw string 时生效**（text 列 / 无 valueFormat）；数字/日期被 valueFormat 转换时不挂 runs（对齐 Google） |
| 选区加粗 | 选区内**逐格写 full-span run**（bounded by 选区）；不做 range 单 layer（§2 非目标 2） |
| fill / sort / 结构 | attachment store 复用 `RangeStyleStore` remap/fill；runs 跟 raw cell |
| 未注册 cell-kit | 默认 text 渲染/编辑，无 runs，不崩（缝默认 fallback，2026-06-12 ADR-C 精神） |
| offset 语义 | 半开 `[start,end)` UTF-16 code-unit；代理对边界由 normalize 保证不切半字符 |

---

## 10. 设计压力第 2 消费者：star-rating（只草图，引用 2026-06-12）

2026-06-12 的跑例 `rating` 即 star-rating：renderer 读 number value 画星（**无需 attachment**）+ 点击 editor + `sortValue`/`parseClipboard`。

两个消费者形状互补、把缝压满：

| 维度 | rich-text | star-rating（rating） |
| --- | --- | --- |
| 是否新值类型 | 否（覆盖 'text'） | 否（覆盖 'text'→number 或新 type） |
| 需 attachment 轴 | **是**（runs 非 value） | 否（值即 number） |
| renderer | 多段 styled-text | 画星 |
| editor | contenteditable + 浮动栏 | 点击/inline |
| 验证点 | 附件轴 + styled-text 原语 + 跨字符编辑 | 纯值语义 + 简单 renderer/editor |

star-rating **不实现**——仅确认缝同时容纳「需附件」与「不需附件」两形状。

---

## 11. Data Flow

### 11.1 渲染

```text
field.type='text' → Canvas2DRenderer 查 cellRenderers['text']
→ 命中 richTextRenderer → getAttachment('richText', view r/c) → 切段 → paintStyledText
→ 未注册 cell-kit → 内置 CellPainter 单段路径
```

### 11.2 编辑提交

```text
RichTextCellEditor 提交
→ DOM → { text, runs(normalized) }
→ Grid commit(text)  +  Grid.setCellAttachment('richText', rawCell, runs)
→ 两者各自 invalidate + undo 入栈
```

### 11.3 附件结构 remap

```text
插/删行列 event → FormatEventHandler 同款路径 → CellAttachmentStore raw-key remap
fill 柄 → 携带 source cell 附件 → 平铺目标
copy/paste → codec serialize/deserialize
```

---

## 12. BDD Gate 候选场景

spec 批准后先写/改场景，再进 writing-plans。

| 层 | 场景 id | 目的 |
| --- | --- | --- |
| Core L0 | `core.L0.cell-attachment-store-get-set` | 附件 set/get raw-key 语义 |
| Core L0 | `core.L0.cell-attachment-codec-roundtrip` | namespace 注册 + serialize/deserialize 往返 |
| Core L1 | `core.L1.cell-attachment-structural-remap` | 插删行列后附件正确跟随 raw cell（off-by-one 守门） |
| Core L1 | `core.L1.cell-attachment-fill-propagate` | fill 柄携带附件平铺 |
| Core L2 | `core.L2.grid-set-cell-attachment-undo` | `setCellAttachment` undo/redo |
| canvas2d L4 | `canvas2d.styled-text-multi-segment-oplog` | 多段 styled-text op-log 稳定（纯 TDD，不写 BDD MD） |
| Excel L3 | `excel.L3.rich-text-toolbar-bold-substring` | 选中子串加粗 → commit → 重开保持 |
| Excel L3 | `excel.L3.rich-text-default-not-bundled` | 未注册 cell-kit 时纯文本、无字体组 |

L4 op-log 属渲染白盒，按方法论只做 TDD。

---

## 13. 分批（BDD 外环 × TDD 内环）

| Phase | 层 | 内容 | 场景 |
| --- | --- | --- | --- |
| A | core | `CellAttachmentStore` + `CellAttachmentCodec` 注册 + raw-key remap/fill/clipboard/undo + `Grid.setCellAttachment` + paint-params accessor 契约 | Core L0–L2 |
| B | canvas2d | `CellPainter` 抽 `paintStyledText` 原语（内置单段零回归）+ underline/strike 手绘 + theme 线 token + `getAttachment` 实现 | canvas2d 集成 / L4 |
| C | cell-kit | 新包脚手架 + `richTextCodec` + `richTextRenderer`（读 runs 切段）+ `RichTextCellEditor` + `FloatingFormatToolbar` + 组合根装配 + boundary lint | Excel L3 |

A→B→C 顺序：附件轴是 B/C 的地基；canvas2d 原语是 C renderer 的地基。

---

## 14. ADR

### ADR-A：附件数据轴独立于值语义轴

| 方案 | 结论 |
| --- | --- |
| 新增 `CellAttachmentStore<T>`（per-cell、语义无关、raw-key、复用 format remap） | 采纳 |
| 把 runs 塞进 `CellTypeDefinition`（值语义轴） | 拒绝 |
| runs 骑在 cell value 上（rich value `{text, runs}`） | 拒绝 |

原因：runs 不属于 value（同串可任意分段）；塞值语义轴语义错位，骑 value 要改 `CellValue`/`DataSource` 全链路且不可逆。独立附件轴让 core 语义无关、扩展只注册 namespace，且复用已验证 remap，避开 off-by-one。

### ADR-B：core `CellFormat` 不含任何 typography

结论：放弃本会话曾议的「range typography（`CellFormat.text`）+ per-cell runs 混合」，全部 typography 走 rich-text attachment。

原因：core 内 typography 字段 = 默认带 + 污染 core，与「基础组件默认不带、dogfooding」硬冲突。代价是「无限列单 layer 加粗」暂不可得（§2 非目标 2），有限选区逐格 full-span run 足够第一版。

### ADR-C：第一方基础组件单独成包，dogfood 公开缝

结论：`@novasheet/cell-kit` 仅用 core/canvas2d/react 已发布 API，与外部第三方扩展同一注册路径。

原因：是缝完整性的最强验证——第一方拼不出 rich-text，即缝有缺口，立刻暴露；同时保证默认入口零基础组件、可 tree-shake。

### ADR-D：rich-text 覆盖内置 `'text'`，非新 FieldType

结论：rich-text 注册到 `'text'`（业务注册优先，2026-06-12 §4.1），值仍 string。

原因：它是 text 上的跨字符样式覆盖，不是新值类型。这一区别正是它需要附件轴、而 rating/assignee 不需要的根因。

### ADR-E：单包，不拆 3 包

结论：单 `@novasheet/cell-kit` 内部分 renderer/editor/codec 模块。

原因：当前单后端单框架，3 包（中立 kit + canvas2d adapter + react adapter）配置/CI/changeset 开销对 1 个扩展不划算。将来上 WebGL/vanilla 壳再拆，纯机械搬迁，无架构债。

---

## 15. 验收清单

1. design spec 经 user 复审。
2. BDD gate：场景 MD 定稿，`mbd validate` + manifest 通过。
3. implementation plan 首类任务让行为测试存在并红。
4. 一 task 一 commit；内环 TDD 红→绿。
5. 完整 gates：`bun run lint`、`bun run --filter '*' typecheck`、`bun test`、build 顺序通过。
6. dogfood 验证：默认 Grid 无字体组；注册 cell-kit 后字体组生效；core 源码 grep 无 `TextRun`/typography 字段。
