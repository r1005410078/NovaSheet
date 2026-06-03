# NovaSheet Clipboard Feature Package Design

## 目标

把剪贴板能力（copy / cut / paste，含 typed-paste 高保真缓存）从 `@novasheet/web` 固定构造拆到默认安装的 `@novasheet/feature-clipboard`。这是路线图 phase 5，第三个「整竖切片」拆包。

剪贴板是命令式能力，无 DOM overlay、无每帧定位，故**不复用 `WebFrameSync`**，也无 `attach`/`destroy` DOM 生命周期——controller 自持一个纯 `navigator.clipboard` 包装。

本次只组织旧代码 + 新增最小契约，不重写剪贴板语义。默认 `@novasheet/sheet` 用户体验保持不变。

**范围决策（brainstorm）**：copy/cut/paste 逻辑 + adapter + TSV 缓存入包；**键盘（Cmd+C/X/V）/右键菜单入口暂留 runtime kernel**，经薄壳委托给 feature（同 editing，待 keyboard/menu 契约期再收）。

## 交互 / 语义切分（对齐不变量 #2）

| 半边 | 归属 | 内容 |
|---|---|---|
| 交互 | `@novasheet/feature-clipboard` | `ClipboardController`、`WebClipboardAdapter`（navigator 包装）、`snapshotSelection`、typed-paste `clipboardCache`、`fnv1aHash`、copy/cut/paste 流程 |
| 语义 | `@novasheet/core`（不动） | `commitPaste`、`clearRange`、`parseTsvToCells` / `serializeRowsToTsv`、`computePasteTarget`、`isMutableDataSource`、`ApplyPasteSource` / `PasteSkippedCell` |
| 契约 | `@novasheet/web` | 新增 `WebClipboard` capability + `web.clipboard` 贡献点、通用 services；**无 `WebFrameSync`** |
| 装配 | `@novasheet/sheet` | 默认 `installClipboardFeature`；`Canvas2DBackend` 不再 `new WebClipboardAdapter` |

## 范围

本包拥有：`ClipboardController`（copy/cut/paste + onEngineMutation 缓存失效）、`WebClipboardAdapter`、`snapshotSelection`、`fnv1aHash`、typed-paste 缓存。

本包不拥有：剪贴板语义（commitPaste/TSV 解析等留 core）；键盘/菜单入口（留 kernel 委托）；Grid 公共 `copy()/cut()/paste()` 门面（留 sheet，经 runtime 薄壳）。

## 契约设计

`web.clipboard` 贡献点（镜像 `web.drag`/`web.cell-editor`），返回纯命令 controller（无 DOM 生命周期）：

```ts
export interface WebClipboard {
  copy(): Promise<boolean>
  cut(): Promise<boolean>
  paste(): Promise<boolean>
  /** 引擎 mutation 后调用：使 typed-paste 缓存失效，避免粘贴过期缓存行。 */
  onEngineMutation(): void
}

export interface WebClipboardRuntimeDeps {
  readonly engine: GridEngine
  afterEngineMutation(): void
  /** per-Grid 事件回调（决策债务）。 */
  onCopy(range: CellRange): void
  onCut(range: CellRange): void
  onPaste(target: CellRange): void
  onPasteSkipped(cells: readonly PasteSkippedCell[]): void
}

export const WEB_CLIPBOARD_CONTRIBUTION = 'web.clipboard'
export interface WebClipboardContribution {
  readonly id: string
  readonly order: number
  create(deps: WebClipboardRuntimeDeps): WebClipboard | null
}
export function registerWebClipboard(ctx, contribution): void
export function getWebClipboardContributions(ctx): readonly WebClipboardContribution[]
```

controller 在构造时 `new WebClipboardAdapter()`（自持，纯 `navigator.clipboard` 包装，失败静默 fallback 到内部缓存），内部持 `clipboardCache: { range; rows; tsvHash } | null`。

## Runtime 行为

移除（剪贴板专用，下放）：

- `clipboardAdapter` 字段、`setClipboardAdapter`、`clipboardCache` 字段、`snapshotSelection`、`handleClipboardCopy/Cut/Paste` 的实现体（改薄壳）、`fnv1aHash`（仅剪贴板用）。

改为委托（保留薄壳，Grid/键盘/菜单入口不变）：

- `handleClipboardCopy()` → `return this.clipboardController?.copy() ?? Promise.resolve(false)`；`handleClipboardCut`/`handleClipboardPaste` 同理。键盘 Cmd+C/X/V、右键菜单 copy/cut/paste、Grid 公共 `copy()/cut()/paste()` 仍调这三个薄壳。
- `afterEngineMutation()` 内把 `this.clipboardCache = null` 改为 `this.clipboardController?.onEngineMutation()`（两处缓存失效点统一到此）。

保留（per-Grid 事件，债务）：`setOnCopy`/`setOnCut`/`setOnPaste`/`setOnPasteSkipped` 与 `onCopy`/`onCut`/`onPaste`/`onPasteSkipped` 字段仍在 runtime（Grid API 不变），经 `createWebClipboardDeps()` 转发给 controller。

新增：探测 `web.clipboard` 贡献 → `this.clipboardController: WebClipboard | null`（无需加入 frameSyncs——剪贴板非每帧 overlay）。

行为规则：

- 未安装 clipboard feature：薄壳 no-op（copy/cut/paste 返回 false）；`onEngineMutation` no-op；不 crash。右键菜单 paste 项仍按 `dataMutable` 显隐（点选后 no-op，可接受）。
- 已安装：行为与现状一致——copy 序列化选区写 OS 剪贴板 + 更新 typed 缓存；cut 复制后 `clearRange`；paste 优先用 tsvHash 命中的 typed 缓存高保真粘贴，否则 `parseTsvToCells` 退化粘贴；`commitPaste` 跳过的格经 `onPasteSkipped` 通知。
- 无 DOM 资源，`ClipboardController` 无 `destroy`；`Grid.destroy()` 不需额外清理。

## fill / editing 一致性

剪贴板 paste 前的「提交进行中编辑」由 kernel 键盘/菜单路径在调用 paste 前已处理（现状即如此，不属本包）。本包不引入对 editing 的新依赖。

## 分阶段

1. **web 契约（独立绿提交）**：`WebClipboard` / `web.clipboard` / `registerWebClipboard` / `getWebClipboardContributions` / `WebClipboardRuntimeDeps`。不触碰现有剪贴板路径。
2. **feature 整竖切片（原子）**：建 `@novasheet/feature-clipboard`，`git mv WebClipboardAdapter`，迁 `snapshotSelection` + `fnv1aHash` + 缓存到 `ClipboardController`；runtime 薄壳委托 + 删实现 + `afterEngineMutation` 改委托 + deps 工厂；backend 删 adapter 构造；sheet 默认安装。一次绿（`git mv` 即破坏 backend，须同提交）。
3. **docs + 全量 gates**。

## 测试策略

- web 契约 test：注册/读取 `web.clipboard` 贡献。
- `WebClipboardAdapter` 单测迁 feature（writeText/readText 失败静默）。
- `ClipboardController` 单测（迁 + 重写）：copy 写缓存 + adapter.writeText；cut 复制后 clearRange + afterEngineMutation；paste typed 缓存命中（tsvHash 相等）走高保真、未命中走 parseTsvToCells；onEngineMutation 后缓存失效（下次 paste 走 parse）；onCopy/onCut/onPaste/onPasteSkipped 回调触发。
- installer test：`installClipboardFeature(ctx)` 注册 `clipboard` 贡献。
- runtime/feature 集成：未安装时 `handleClipboardPaste` no-op、不 crash；安装后经 runtime 薄壳 copy/paste 经 engine 提交。
- sheet test：默认 `Grid` 含 clipboard 贡献；`Grid.copy/cut/paste` 与 `onPaste`/`onPasteSkipped` 仍可用。

## 验收

- `@novasheet/feature-clipboard` 有独立 `package.json` / `build.ts` / `tsconfig.json` / `tsconfig.build.json` / `src/index.ts` / `installClipboardFeature`。
- `WebClipboardAdapter` 用 `git mv` 迁移，不重写剪贴板语义。
- `@novasheet/web` 除 4 个 `onCopy/Cut/Paste/PasteSkipped` deps 成员（债务）外不出现 clipboard 专名成员；新增通用 `WebClipboard` slot。
- `@novasheet/sheet` 默认安装；`Grid.copy/cut/paste`、`onCopy/onCut/onPaste/onPasteSkipped` 行为不变。
- 未安装 clipboard 时 runtime 不 crash。
- `bun run lint` / `bun run --filter '*' typecheck` / `bun test` 通过；全包 build 通过。
- `docs/architecture.md` 与路线图更新。

## 后续不在本轮（已知 follow-up）

- **keyboard / menu 契约**：Cmd+C/X/V 与右键菜单 copy/cut/paste 入口仍在 kernel（`handleHostKeyDown` / `handleContextMenuAction`），待 keyboard / menu contribution 词汇表建立后由 feature 自 claim。
- **4 个事件回调迁 engine/command 事件**：`onCopy`/`onCut`/`onPaste`/`onPasteSkipped` 暂留 web deps（债务，同 onFill），待 engine 事件系统专项。

## 自检

- 没有重写剪贴板语义；core paste/TSV kernel 完全不动。
- 没有让 `@novasheet/web` 依赖具体 feature；deps 仅保留 4 个事件回调（债务，已记录）。
- 剪贴板无 DOM overlay，故不复用 `WebFrameSync`、controller 无 attach/destroy——刻意区别于 fill/editing。
- 键盘/菜单入口暂留 kernel 是显式有界决策。
- 未安装 feature 的 no-op、缓存失效、事件回调均有显式验收。
