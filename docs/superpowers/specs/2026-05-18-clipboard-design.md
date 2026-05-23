# NovaSheet Clipboard（Phase 4.1）

- **Date**: 2026-05-18
- **Status**: Approved
- **Scope**: 单元格区域的 Cut / Copy / Paste —— 系统剪贴板 + 内部类型缓存（混合）；Ctrl+X / C / V 快捷键；与 4.0 右键菜单端到端打通。
- **Out of scope（明确推迟）**：
  - 多选离散区域（4.x 后续）
  - 图片 / 富文本（HTML）粘贴 → Phase 5 cell formatting 配套
  - Undo / Redo → Phase 4.2
  - Paste-special / 格式刷
  - 跨 tab BroadcastChannel 同步
  - 公式相对引用偏移（Phase 7）

---

## 1. Problem

Phase 4.0 交付了菜单 shell + `onContextMenuAction` 回调；4.0 内部不动剪贴板。本期实现真正的剪贴板语义：

1. 与 Excel / Sheets / 普通文本编辑器**双向互通**（TSV 标准）
2. 内部保留类型信息（number / boolean 不在 round-trip 中退化为 string）
3. 键盘快捷键与右键菜单走**同一引擎**，不重复实现
4. 4.0 的 consumer 不传 `onContextMenuAction` 也能默认 work（4.1 默认接 grid 自己的引擎）

---

## 2. Goals（4.1）

1. Cut / Copy / Paste 三个动作对**矩形 selection** 工作；与现有 `SelectionModel.selectedRange` 配合
2. **混合存储**：`navigator.clipboard.writeText` 写 TSV 到系统剪贴板（外部 app 可见）+ 内部 Map 缓存原始 `Row[][]`（同一 Grid 自己粘贴时保留类型）
3. **Cut 立即清** 原格（Sheets 风格；快照已经在剪贴板上，源已失效）
4. **类型不匹配粘贴**：跳过该格 + emit `onPasteSkipped(cells)` 事件，不抛错、不全表回滚
5. **外部 TSV paste**：`navigator.clipboard.readText` 拿字符串，按 `\t` / `\n` 切，逐格按 schema 类型 coerce
6. **键盘 Ctrl+X/C/V**（Mac 上 Cmd），单元格编辑中不拦截（让浏览器原生剪贴板接管 input/textarea）
7. **4.0 的 menu 默认走 4.1 引擎**：consumer 不写 `onContextMenuAction`，点 Cut / Copy / Paste 自动跑

---

## 3. Non-Goals（4.1）

- 多个不连续矩形（Sheets / Excel 按住 Ctrl 选多块）
- HTML 富文本格式保留
- 公式 / 跨引用偏移（Phase 7）
- 全屏 marching ants 动效（4.x polish 阶段可加）
- Cross-tab clipboard sync

---

## 4. UX

### 4.1 Cut

| 触发           | 条件                                    | 行为                                                                    |
| -------------- | --------------------------------------- | ----------------------------------------------------------------------- |
| Ctrl+X / Cmd+X | grid 持焦点 + selection 非空 + 非编辑中 | snapshot 选区 + 写系统剪贴板 + 内部缓存 + **立即清原格** + emit `onCut` |
| 菜单 Cut 项    | 同上                                    | 同上                                                                    |

清原格语义：对 selectedRange 每个 cell 调 `data.updateCell(row, fieldId, null)`。

### 4.2 Copy

| 触发           | 条件                                    | 行为                                                               |
| -------------- | --------------------------------------- | ------------------------------------------------------------------ |
| Ctrl+C / Cmd+C | grid 持焦点 + selection 非空 + 非编辑中 | snapshot + 写系统剪贴板 + 内部缓存 + emit `onCopy`；**不修改数据** |
| 菜单 Copy 项   | 同上                                    | 同上                                                               |

### 4.3 Paste

| 触发           | 条件                                                   | 行为                                                       |
| -------------- | ------------------------------------------------------ | ---------------------------------------------------------- |
| Ctrl+V / Cmd+V | grid 持焦点 + active cell + 非编辑中 + DataSource 可写 | 读剪贴板 → 决定 source → 计算 target → 逐格 coerce + write |
| 菜单 Paste 项  | 同上                                                   | 同上                                                       |

#### Source 决定

1. `navigator.clipboard.readText()` 异步取 TSV 字符串
2. 计算 hash（FNV-1a 简单 hash 即可）
3. 若 hash 匹配**内部缓存**（同 Grid 自己最近 cut/copy）→ source = 缓存的 `Row[][]`（保留类型）
4. 否则 → `parseTsv(text, schema, anchorColIndex)` → `Row[][]`（按列类型 coerce）

#### Target rect 决定（spec §4.3 关键决策）

记 source 为 `R0 × C0` 个格，active cell 为 `(r, c)`，当前 selectedRange 大小 `Rs × Cs`：

| 情况                                     | target rect                                                       |
| ---------------------------------------- | ----------------------------------------------------------------- |
| `Rs × Cs == 1 × 1`（单格选区）           | active cell 起，向右下扩 `R0 × C0`                                |
| `Rs == R0 && Cs == C0`（一对一）         | selectedRange 原样                                                |
| `Rs % R0 == 0 && Cs % C0 == 0`（整数倍） | 在 selectedRange 内**铺砌** tile                                  |
| 其它（非倍数 / 超出）                    | 从 selectedRange 左上角填，多出的 source 丢弃；不足的 target 不动 |

边界裁剪：target rect 超出 grid 范围时按 `rowCount / colCount` 裁切，超出部分丢弃。

#### Type coerce per cell

按 target cell 对应字段的 `type`：

| Field type                     | 字符串 value 处理                                                            |
| ------------------------------ | ---------------------------------------------------------------------------- |
| `text`                         | 直接 set                                                                     |
| `number`                       | `Number(trim)`；`NaN` 或空 → **跳过 + 记 onPasteSkipped**                    |
| `singleSelect` / `multiSelect` | 4.1 只接 string 形式（后续 Phase 6 字段编辑器再扩）                          |
| `date`                         | `Date.parse(trim)`；非法 → 跳过                                              |
| `checkbox`                     | `'true' / '1' / 'yes'` → true；`'false' / '0' / 'no' / ''` → false；其它跳过 |
| `url`                          | text 同样处理                                                                |

内部缓存命中时**不走 coerce**——已是原始类型，直接 `updateCell`。

### 4.4 Paste 跳过反馈

`onPasteSkipped(cells: { rowIndex, fieldId, reason: 'type' | 'readonly' }[])`：

- 至少一格被跳过就触发（一次）
- consumer 可以 toast / log
- 默认无 console 输出（避免噪音）

### 4.5 编辑中的特殊处理

cell editor 打开期间：

- **Ctrl+C/X/V 不被 runtime 拦截** —— textarea / input 走浏览器原生剪贴板（编辑器内文本片段操作）
- 菜单也不开（Phase 4.0 spec §4.1 已经 commit edit 后才开）

### 4.6 焦点要求

剪贴板快捷键监听挂在 scrollHost（spec §6.1 的已有 keydown 入口）。grid 未持焦点（如点了页面别处）时快捷键完全不到 runtime，符合 Sheets 行为。

---

## 5. Public API（Phase 4.1 新增）

```ts
// @novasheet/core
export interface PasteSkippedCell {
  readonly rowIndex: number
  readonly fieldId: string
  readonly reason: 'type' | 'readonly'
}

export type ClipboardAction = 'cut' | 'copy' | 'paste'

// 纯函数（pure，可单测）
export function serializeRowsToTsv(rows: readonly Row[], fieldIds: readonly string[]): string
export function parseTsvToCells(
  text: string,
  fieldIds: readonly string[],
  schema: Schema,
): readonly (readonly (string | number | boolean | null)[])[]
```

```ts
// @novasheet/web — Grid facade
interface GridOptions {
  // 4.0:
  onContextMenuAction?: ... // 4.1 之后变成 optional override；不传走默认引擎
  // 4.1 新:
  onCopy?: (range: CellRange) => void
  onCut?: (range: CellRange) => void
  onPaste?: (target: CellRange) => void
  onPasteSkipped?: (cells: readonly PasteSkippedCell[]) => void
}

class Grid {
  // 4.1 新——异步（受 navigator.clipboard 限制）
  copy(): Promise<boolean>
  cut(): Promise<boolean>
  paste(): Promise<boolean>

  // 4.0 的 setClipboardReady 保留但变 no-op（4.1 自动管理）。consumer 不必调。
}
```

### 5.1 与 4.0 menu 的衔接

`onContextMenuAction` 在 4.1 之后的解析：

1. consumer 传了 callback → 完全由 consumer 处理（4.0 行为保留，最大灵活）
2. consumer **没传** → runtime 内部 dispatch：`'cut' → grid.cut()`、`'copy' → grid.copy()`、`'paste' → grid.paste()`

Paste 菜单项的 `disabled` 计算从此变成：

- `data` 不是 `MutableDataSource` → disabled
- 否则 → enabled（不再依赖 `clipboardReady`；外部剪贴板有内容 vs 没有，4.1 不预知，点了才知道）

---

## 6. Architecture

### 6.1 包内位置

| 件                                                                     | 包                          | 备注                                                              |
| ---------------------------------------------------------------------- | --------------------------- | ----------------------------------------------------------------- |
| `TsvFormat.ts`（serialize / parse）                                    | `@novasheet/core/clipboard` | 纯函数，平台无关                                                  |
| `ClipboardModel.ts`（snapshot + cache）                                | `@novasheet/core/clipboard` | 内部 Map<gridId, snapshot> 类型                                   |
| `ApplyPaste.ts`（target rect + coerce + write）                        | `@novasheet/core/clipboard` | 调 `MutableDataSource.updateCell`                                 |
| `WebClipboardAdapter.ts`（navigator.clipboard 封装 + 浏览器 fallback） | `@novasheet/web/clipboard`  | 异步 read/write 接口                                              |
| `WebGridRuntime` 扩展                                                  | `@novasheet/web/runtime`    | keydown 路由 Ctrl+X/C/V + 内部缓存 + onContextMenuAction 默认实现 |
| `Canvas2DBackend` 装配                                                 | `@novasheet/web/backends`   | 注入 adapter + 接 runtime                                         |
| Storybook story                                                        | `apps/storybook`            | 显示 copy / cut / paste + skip 反馈                               |

依赖方向不变：`core ← web ← web-canvas2d`。Core 的 clipboard 模块不依赖 `navigator.clipboard`。

### 6.2 数据流

```
Ctrl+C 或 menu Copy
  → runtime.handleClipboardCopy()
  → engine.getSelection() → range
  → engine.getRows(range)
  → core.serializeRowsToTsv(rows, fieldIds) → tsv
  → adapter.writeText(tsv)  // async, fire-and-forget UI 立即返回
  → cache.set({ range, rows, schema, tsvHash })
  → emit onCopy(range)

Ctrl+X 或 menu Cut
  → 同 copy
  → engine.clearRange(range)  // 立即清，Sheets 风格
  → afterEngineMutation
  → emit onCut(range)

Ctrl+V 或 menu Paste
  → runtime.handleClipboardPaste() [async]
  → tsv = await adapter.readText()
  → if (cache.tsvHash === hashTsv(tsv)) source = cache.rows
    else source = parseTsvToCells(tsv, fieldIdsAtAnchorCol, schema)
  → target = computePasteTarget(activeCell, selectedRange, sourceShape, gridDims)
  → applyPaste(source, target, schema, data, onSkipped)
  → afterEngineMutation
  → emit onPaste(target) + onPasteSkipped(skipped) 如果非空
```

### 6.3 内部缓存生命周期

- per-Grid 实例（每个 Grid 自己一份），生存在 `WebGridRuntime`
- copy / cut 写入；paste 验证 hash 是否还匹配
- `setData` / `destroy` 清空
- 不暴露给 consumer

### 6.4 引擎扩展：`engine.clearRange(range)`

`DefaultGridEngine` 新增方法，遍历 range 调 `updateCell(row, fieldId, null)`；非 MutableDataSource 返回 false 不抛错。

### 6.5 不变量

1. 所有数据写入走 `MutableDataSource.updateCell`——剪贴板模块不直接修改 axis / DataSource 内部
2. 异步剪贴板调用失败（用户拒权 / Safari 沙盒）→ silent no-op + warn console（一次）
3. 内部缓存的 `tsvHash` 与剪贴板写入的 TSV 字符串保持一致——粘贴时验证
4. 编辑器打开期间 runtime 不拦截 Ctrl+X/C/V
5. Read-only DataSource：Cut / Paste 静默 no-op；Copy 仍允许
6. `Grid.destroy()`：先关菜单（4.0 invariant）→ 清剪贴板缓存 → 走 4.0 destroy 流程

---

## 7. TSV format spec

### 7.1 Serialize

- 行间 `\n`，格间 `\t`
- 值序列化：
  - `null / undefined` → 空字符串 ``
  - `string` → 内容若含 `\t` 或 `\n` → **不转义**，按 4.1 简化原样写（前提：text 列允许包含；解析时同一逻辑）；double-quote 也不动
  - `number` → `String(n)`，`NaN` / `Infinity` → 空
  - `boolean` → `'true'` / `'false'`
  - `Date` → ISO 字符串 `toISOString()`
  - 数组（multiSelect）→ `value.join(',')`
- 末行 `\n` 可选（Excel 一般加；解析时 trim trailing newline）

> **限制说明**：含 `\t` 或 `\n` 的 text 在 round-trip 中会拆出额外格。4.1 不引入双引号转义（保持解析简单）。后续阶段需要时升级 RFC 4180 风格的 quoted-field。

### 7.2 Parse

- `trim()` 末尾换行
- `split('\n')` 切行；`split('\t')` 切格
- 行长不一时按最长行补 `''`
- 每格按目标列类型 coerce（见 §4.3 表）

---

## 8. Testing

| 测试                                                                       | 文件                                                   |
| -------------------------------------------------------------------------- | ------------------------------------------------------ |
| TSV serialize / parse round-trip（全 7 种 field type）                     | `packages/core/tests/clipboard/TsvFormat.test.ts`      |
| `parseTsvToCells` 类型 coerce 边界（空串 / NaN / 非法日期 / "true"）       | 同上                                                   |
| `computePasteTarget` 四种 case（单格 / 一对一 / 整数倍 tile / mismatched） | `packages/core/tests/clipboard/ApplyPaste.test.ts`     |
| `applyPaste` 跳过 callback 计数                                            | 同上                                                   |
| `engine.clearRange` 对 MutableDataSource 工作                              | `packages/core/tests/engine/DefaultGridEngine.test.ts` |
| `WebClipboardAdapter` mock navigator.clipboard                             | `packages/web/tests/clipboard/`                        |
| keyboard Ctrl+X/C/V routing；editor 中不拦截                               | `packages/web/tests/runtime/WebGridRuntime.test.ts`    |
| menu `'copy'` action 走默认引擎（consumer 不传 onContextMenuAction）       | `packages/web/tests/Grid.test.ts`                      |
| Storybook 手动验证                                                         | `apps/storybook/src/stories/Clipboard.stories.ts`      |

---

## 9. Risks / Open Questions

| #   | 风险 / 问题                                                                    | 4.1 应对                                                                      |
| --- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| R1  | Safari `navigator.clipboard.readText` 需要用户手势 + HTTPS；不行就抛           | catch 后 warn + treat as empty clipboard；不影响 grid 其它功能                |
| R2  | 包含 `\t` / `\n` 的 text 在 round-trip 会拆格                                  | spec §7.1 已声明；后续 RFC 4180 升级                                          |
| R3  | 大区域复制（10K rows × 100 cols）TSV 字符串可能 MB 级，writeText 慢            | 4.1 不优化；后续可加阈值 + chunked 或异步进度                                 |
| R4  | Sheets 风格 Cut 立即清——若 paste 失败（如外部 paste 进了别的应用），原数据丢失 | 用户接受 trade-off；后续 4.2 Undo 兜底                                        |
| OQ1 | `onPasteSkipped` 仅 type 还是含 readonly？                                     | 4.1 含 `'type' \| 'readonly'` 两种 reason，便于 consumer toast                |
| OQ2 | TSV hash 用什么算法                                                            | FNV-1a 32-bit string hash（轻量、足够区分）                                   |
| OQ3 | Multi-Grid 同 page，复制 A 粘贴 B 走系统剪贴板，是否走类型缓存命中？           | 否——hash 相同但 cache 在 A 里不在 B 里，B 走 TSV parse 路径，可能丢类型；接受 |

---

## 10. References

- Phase 4.0 context menu spec：`docs/superpowers/specs/2026-05-17-context-menu-design.md`
- Phase 3.5 cell editor（Ctrl+X/C/V 编辑中不拦截参考实现）：`packages/web/src/interaction/DomCellEditor.ts`
- TSV de facto standard：Excel / Google Sheets 的剪贴板格式（与 RFC 4180 CSV 类似但简化）
- MDN：[`navigator.clipboard`](https://developer.mozilla.org/docs/Web/API/Clipboard)

---

## 11. Spec self-review

- [x] 4.1 交付物明确：Cut / Copy / Paste + 快捷键 + 默认接 4.0 菜单
- [x] 外部 TSV 互通在范围内（§4.3 + §7）
- [x] Cut 立即清 + Sheets 风格已记
- [x] 类型不匹配处理已统一（跳过 + 事件）
- [x] 编辑器中不拦截快捷键
- [x] Public API：types + 3 facade async 方法 + 4 callback option
- [x] 不变量 6 条覆盖 destroy 顺序、读写边界、editor 隔离
- [x] 测试到文件粒度
- [x] Risks / OQ 段落显式
- [x] 与 4.0 spec 的 invariant 不冲突（destroy 顺序、单 Grid 缓存、async clipboard）
- [x] 路线图避免与 README 双源（不再在 spec 重复列 Phase 4 子阶段）
