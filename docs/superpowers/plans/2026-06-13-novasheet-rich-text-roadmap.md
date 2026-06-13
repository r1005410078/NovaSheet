# Rich-Text 完整实现路线图（A→B→C）

> **定位:** 贯穿 rich-text 全程的**单一事实源 + 防丢功能清单**。spec 给设计、各 phase plan 给 bite-sized 步骤，本文件保证「跨 phase 不丢步骤/功能」。每展开一个 phase 的完整 plan，回这里勾状态。
>
> **前置:** spec [`2026-06-13-novasheet-cell-kit-rich-text-design.md`](../specs/2026-06-13-novasheet-cell-kit-rich-text-design.md) · 缝基线 [`2026-06-12-novasheet-cell-extension-api-design.md`](../specs/2026-06-12-novasheet-cell-extension-api-design.md)
>
> **状态图例:** ☐ 未开始 · ◐ plan 已详化未实现 · ☑ 已实现并绿

---

## 0. 三 phase 一图

```
Phase A  core 附件数据轴 ───────┐ (地基：承载 runs)
                                ├──► Phase C  cell-kit rich-text（装配 + 编辑）
Phase B  canvas2d styled-text ──┘ (地基：画多段)
```

依赖序硬约束：**A、B 可并行**（互不依赖）；**C 依赖 A+B 全绿**。A 是 runs 的存储地基，B 是 runs 的渲染地基，C 才把两者 + 编辑器装进 `@novasheet/cell-kit`。

| Phase | 包/层 | plan | 状态 |
| --- | --- | --- | --- |
| A | `@novasheet/core` 附件轴 | [`2026-06-13-...-cell-attachment-axis-phase-a.md`](./2026-06-13-novasheet-cell-attachment-axis-phase-a.md) | ☑ 已 ship |
| B | `@novasheet/canvas2d` styled-text | [`2026-06-13-...-styled-text-phase-b.md`](./2026-06-13-novasheet-styled-text-phase-b.md) | ☑ 已 ship |
| C | `@novasheet/cell-kit` rich-text | 待展开 | ☐ |

---

## 1. Feature 清单（防丢功能勾选表）

> 每行 = 一个可观测能力 / 必做工程项。实现完置 ☑。这是「不丢功能」的总账。

### 1.1 字体组属性（截图工具栏 + Underline）

| 能力 | 落点 | 状态 |
| --- | --- | --- |
| Bold | B 渲染 + C 工具栏/编辑 | ☐ |
| Italic | B + C | ☐ |
| Underline（Canvas 手绘线） | B + C | ◐ B 渲染原语已 ship，C 工具栏待 |
| Strikethrough（Canvas 手绘线，截图含） | B + C | ◐ B 渲染原语已 ship，C 工具栏待 |
| Font size per-run（截图 −/+） | B（行高括高）+ C（工具栏） | ◐ B 混排行高已 ship，C 工具栏待 |
| Font family per-run | B + C | ◐ B StyledSegment.font 已 ship，C 待 |
| Text color per-run（截图 A） | B（段 fillStyle）+ C（颜色选择器） | ◐ B 段 fillStyle 已 ship，C 待 |

### 1.2 数据模型（runs）

| 能力 | 落点 | 状态 |
| --- | --- | --- |
| `TextRun {start,end,attrs}` 半开 UTF-16 offset | C（cell-kit 类型） | ☐ |
| `TextRunAttrs`（7 属性，全 optional=继承） | C | ☐ |
| normalize：排序 + 不重叠 + 合并相邻等格 + gap 继承 | C | ☐ |
| 代理对边界不切半字符 | C（normalize 保证） | ☐ |
| 存 attachment `'richText'` namespace（opaque） | A 存储 + C codec | ☐ |
| `richTextCodec` serialize/deserialize | C | ☐ |

### 1.3 存储/数据完整性（Phase A）

| 能力 | 落点（Task） | 状态 |
| --- | --- | --- |
| `CellAttachmentStore` get/set | A Task2 | ☑ |
| 结构 remap（插/删/重排 行列，点 cell） | A Task2+3 | ☑ |
| undo/redo（format command 附件快照分支） | A Task4 | ☑ |
| snapshot/restore | A Task2 | ☑ |
| `Grid.setCellAttachment/getCellAttachment` 门面 | A Task5 | ☑ |
| `GridOptions.cellAttachments` codec 注册 | A Task5 | ☑ |
| frame 暴露 view 坐标附件解析器（供 B 读） | A Task6 | ☑ |
| **fill 柄携带 runs**（对齐 Google，bb015ed 同款） | A Task8（**待定时机**，见 §5） | ☐ |
| **clipboard copy/paste 经 codec** | A Task9 或 C（**待定**，见 §5） | ☐ |

### 1.4 渲染（Phase B）

| 能力 | 落点 | 状态 |
| --- | --- | --- |
| `paintStyledText` 多段绘制原语（canvas2d 公开导出） | B | ☑ |
| 内置单段路径复用同原语，**零回归** | B（不迁移内置，原语独立+零回归） | ☑ |
| underline / strike 手绘线段（measure x + 基线偏移） | B | ☑ |
| theme token：underline/strike 线宽 + 偏移 | B | ☑ |
| 混排行高 = 段内最大 fontSize 括高 | B（全局最大统一行高） | ☑ |
| wrap/overflow/clip × 多段（复用 `wrapText`+measurer） | B | ☑ |
| 省略号截断 × 多段 | B | ☑ |
| `getAttachment` 在 paint params 的**透传** | B Task7（消费在 C renderer） | ☑ |
| valueFormat×runs 门：runs 仅显示=raw string 时生效 | **C** richTextRenderer（B 无 runs 消费者，无法测；见 Phase B plan Self-Review） | ☐ |
| DPR 1/1.5/2/3 清晰（线段不糊） | B | ☐ |

### 1.5 编辑（Phase C）

| 能力 | 落点 | 状态 |
| --- | --- | --- |
| `RichTextCellEditor`（contenteditable，editor adapter 缝注册） | C | ☐ |
| runs → span 回填初值 | C | ☐ |
| 提交：DOM → normalized runs + plain text | C | ☐ |
| 提交写 value + `setCellAttachment` | C | ☐ |
| `FloatingFormatToolbar`（size −/+、B、I、U、删除线、颜色 A） | C | ☐ |
| 工具栏作用于 DOM Selection + toggle 语义 | C | ☐ |
| 颜色选择器复用 `2026-06-11-toolbar-custom-color-picker` | C | ☐ |
| editor overlay 坐标系正确（延 4ee78e1） | C | ☐ |
| destroy/unmount 幂等（StrictMode mount→destroy→mount 绿） | C | ☐ |
| **选区加粗** = 选区内逐格写 full-span run | C | ☐ |

### 1.6 打包 / dogfood（Phase C）

| 能力 | 落点 | 状态 |
| --- | --- | --- |
| `packages/cell-kit/` 脚手架（package.json/tsconfig/build/tests/README） | C | ☐ |
| `richTextExtension` 装配（codec+renderer+editor） | C | ☐ |
| boundary lint：禁 core/canvas2d/react 反向依赖 cell-kit | C | ☐ |
| **默认不带**验证：默认 Grid 无字体组；注册后生效 | C（BDD `excel.L3.rich-text-default-not-bundled`） | ☐ |
| core 零 typography/TextRun（`grep` 门） | A Task7 + C | ☐ |
| storybook story（cell-kit 注册示例） | C | ☐ |
| 组合根装配示例（cellAttachments+cellEditors+cellRenderers 三注册点） | C | ☐ |

### 1.7 跨切面 / 收尾（每 phase）

| 项 | 状态 |
| --- | --- |
| BDD 场景 L0–L3 定稿 + `mbd validate` + manifest | ☐ |
| `lint:scenario-coverage` 不退化 | ☐ |
| 四门：`bun test` / typecheck / `bun run lint` / build（core 先） | ☐ |
| 里程碑 dispatch code-reviewer（即便全绿） | ☐ |

---

## 2. Phase A — core 附件数据轴（plan 已详化）

完整 bite-sized 步骤见 [Phase A plan](./2026-06-13-novasheet-cell-attachment-axis-phase-a.md)。里程碑：

1. BDD gate 附件场景红 → 2. `CellAttachmentStore`（镜像 `RangeStyleStore`）→ 3. 接 `FormatState`+结构 remap → 4. undo 分支 → 5. Grid 门面+`GridOptions` → 6. frame 读取契约 → 7. 全量 gates。

**出口判据:** §1.3 除 fill/clipboard 外全 ☑；§1.4 的 frame 读取契约 ☑；core grep 无 rich-text 痕迹。

---

## 3. Phase B — canvas2d styled-text（☑ 已 ship）

完整 bite-sized 步骤见 [Phase B plan](./2026-06-13-novasheet-styled-text-phase-b.md)。7 Task 映射：

| plan Task | 任务 | roadmap 对应 |
| --- | --- | --- |
| T1 | core `ThemeText` token（行高倍数 + underline/lineThrough 几何） | B3 token 部分 |
| T2 | `paintStyledText` 单段单行核（font/color/对齐） | B1 原语骨架 |
| T3 | 多段单行（font/fillStyle 切换 + x 累加） | B2 |
| T4 | underline/line-through 手绘线（读 ThemeText） | B3 |
| T5 | `\n` 多行 + 混排行高（段内最大字号）+ maxLines | B4 |
| T6 | wrap 模式段感知分行 + 末行省略号（对齐 `wrapText`） | B5 |
| T7 | `getAttachment` 透传 custom renderer params + 导出原语 + 全量 gates | B6 |

**决策（偏离原 B1）:** **不迁移内置 `CellPainter` 路径**走 `paintStyledText`。迁移 number/wrap/ellipsis 三条既有路径触碰 30+ golden、零功能收益、高回归风险；原语作独立文件由 Phase C 消费即满足需求，零回归改由「新增文件不动既有」保证。若评审坚持防长期漂移，另开 follow-up 仅迁移 `paintLines`（overflow/clip 文本路径），以既有 golden 为闸门。

**B7 valueFormat×runs 门移出 Phase B:** 该门是 renderer 决策，无 runs-消费 renderer 无法测——留 Phase C richTextRenderer（见 §1.4）。

**core 命名避闸门:** core `ThemeText` 用 `lineThrough*`（非 `strikethrough`），保 `grep -rn "strikethrough" packages/core/src` 空。

**依赖:** A Task6（已 ship）；现可独立执行。

**出口判据:** §1.4 除 valueFormat×runs（移 C）外全 ☑。

---

## 4. Phase C — cell-kit rich-text（待展开成完整 plan）

里程碑任务：

| # | 任务 | 层 |
| --- | --- | --- |
| C1 | `packages/cell-kit/` 脚手架 + boundary lint | 包配置 |
| C2 | `TextRun`/`TextRunAttrs` 类型 + `normalize`（排序/合并/gap/代理对） | cell-kit（纯函数，TDD） |
| C3 | `richTextCodec`（serialize/deserialize，注册 `'richText'`） | cell-kit→core |
| C4 | `richTextRenderer`（`Canvas2DCellRenderer`：读 runs→切段→`paintStyledText`） | cell-kit→canvas2d |
| C5 | `RichTextCellEditor`（contenteditable，runs↔DOM，提交写 value+attachment） | cell-kit→react |
| C6 | `FloatingFormatToolbar`（size/B/I/U/strike/color，Selection toggle，复用 color picker） | cell-kit→react |
| C7 | 选区加粗 = 逐格 full-span run（应用门面） | cell-kit + core 门面 |
| C8 | `richTextExtension` 装配 + 组合根 + storybook story | cell-kit |
| C9 | BDD：`excel.L3.rich-text-toolbar-bold-substring` + `...-default-not-bundled` 转绿 | react excel L3 |

**风险:**
- contenteditable ↔ runs 双向序列化是最易错点（光标/换行/嵌套 span 规整）——C5 必须 TDD 覆盖「加粗子串→提交→重开保持」「跨 run 边界选择」「全选 toggle 取消」。
- dogfood 验证（C9 `default-not-bundled`）是缝完整性的硬门：若 cell-kit 拼装时发现缺 core/canvas2d/react 的公开 API，**STOP**——回头补缝，别在 cell-kit 走私有通道。

**依赖:** A + B 全绿。

**出口判据:** §1.1/1.2/1.5/1.6 全 ☑；§1.7 收尾门过。

---

## 5. 待定决策（须拍板，别静默）

| # | 决策 | 选项 | 倾向 |
| --- | --- | --- | --- |
| D1 | fill 柄携带 runs 的时机 | (a) Phase A Task8 即接 / (b) 留 Phase C 接 rich-text 时 | **(b)**：A 先骨架+undo，fill 等真消费者再接，避免无消费者空实现 |
| D2 | clipboard codec 接入时机 | (a) Phase A Task9 / (b) Phase C | **(b)**：同上 |
| D3 | 选区加粗的 range 优化 | 逐格 full-span run（本批）/ 无限列单 layer（后续） | 本批逐格，足够有限选区 |

D1/D2 一旦定 (b)，Phase A 出口判据排除 fill/clipboard（已在 §1.3 标）。

---

## 6. 显式 Deferred（spec §2，**不在本 feature 内**，防 scope 蔓延）

- range 级整列加粗单 layer 优化（无限列）
- hyperlink / 富链接 run
- 对齐 / 垂直对齐 / 文本旋转（cell 级，与字体组正交）
- 运行时 register/unregister（沿用构造期注册）
- WebGL renderer / cell-kit 拆 3 包

任何一项要进，先回 spec 改 §2 再排 plan，不夹带。

---

## 7. 整体出口（rich-text 端到端 Done 判据）

1. §1 清单除 §6 deferred 外全 ☑。
2. 默认 `@novasheet/react` Grid 无字体组；`import` 并注册 `@novasheet/cell-kit` 后，选中子串可加粗/斜/下划/删除线/改字号/改色，提交后重开保持。
3. 富文本格经 fill/sort/插删行后 runs 正确跟随（或保守 no-op，不错位）。
4. `grep -rn "TextRun\|fontWeight\|strikethrough" packages/core/src` 为空（core 零污染）。
5. 四门全绿 + 三 phase 各自 code-reviewer 过。
