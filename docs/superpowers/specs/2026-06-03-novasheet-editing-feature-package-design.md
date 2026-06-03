# NovaSheet Editing Feature Package Design

## 目标

把单元格编辑能力（DOM 编辑器 + 编辑生命周期）从 `@novasheet/web` 固定构造拆到默认安装的 `@novasheet/feature-editing`。这是路线图 phase 4，第二个「整竖切片」拆包，复用 phase 3 建立的 `WebFrameSync` 每帧同步基座做编辑器定位。

本次只组织旧代码 + 新增最小契约，不重写编辑语义。默认 `@novasheet/sheet` 用户体验保持不变，自定义 editor（`Grid.openCustomCellEditor`）仍可用。

**范围决策（brainstorm）**：编辑器 DOM + 生命周期 + 定位入包；**键盘/双击起编入口暂留 runtime kernel**，经 deps 委托给 feature（编辑键入口与 resize 键盘一样，待 keyboard 契约期再收）。编辑器定位**复用 `WebFrameSync`**。

## 交互 / 语义切分（对齐不变量 #2）

| 半边 | 归属 | 内容 |
|---|---|---|
| 交互 | `@novasheet/feature-editing` | `DomCellEditor`、`cell-editor-style`、`computeCellEditorRect`、open/show/commit/cancel/定位 生命周期、multiline 判定 + autofit-on-commit + 取消时行高恢复 |
| 语义 | `@novasheet/core`（不动） | `beginCellEdit` / `updateCellEditDraft` / `commitCellEdit` / `cancelCellEdit` / `isCellEditing`、`RenderFrame.cellEdit` session、`computeCellRect` |
| 契约 | `@novasheet/web` | 新增 `WebCellEditor` capability + `web.cell-editor` 贡献点、通用 kernel services；复用 `WebFrameSync` |
| 装配 | `@novasheet/sheet` | 默认 `installEditingFeature`；`Canvas2DBackend` 不再 `new DomCellEditor`，自定义 editor 经 feature |

> 编辑「语义半边」（begin/commit/cancel/draft session）已全部在 `@novasheet/core`，本次完全不动。

## 范围

本包拥有：

- `DomCellEditor` + `cell-editor-style`（DOM 编辑器与样式）。
- `computeCellEditorRect`（合并区感知的编辑器矩形几何）。
- 编辑生命周期：`open` / `beginWithDraft` / `showEditor` / `commitActive` / `cancelActive` / 每帧定位。
- multiline 判定（非 number 字段多行）、提交后 autofit 行高、取消时恢复 multiline 原始行高。
- `installEditingFeature(ctx)`。
- 对应单元/行为测试 ownership。

本包不拥有：

- 编辑语义 mutation（留 core engine）。
- 键盘/双击起编入口（`handleHostKeyDown` 的 F2/键入、`handleHostDoubleClick`）—— 留 runtime kernel，经 deps 委托。
- `isCellEditing`（engine 状态，kernel 直接读）。
- 滚动/绘制 kernel（`ensureCellVisible`、`paintSync` 等，作为通用 service 暴露）。

## 包边界与依赖方向

```txt
@novasheet/core
  ↑
@novasheet/web ──────────────┐
  ↑                          │
@novasheet/feature-editing
  ↑
@novasheet/sheet
```

`@novasheet/web` 不依赖 `@novasheet/feature-editing`。

## 契约设计

**`WebCellEditor` capability**（editing 不是 drag，需独立 contribution point）：

```ts
/** 编辑器命令接口：runtime 的键盘/双击入口与 commitActiveEdit 服务委托给它。 */
export interface WebCellEditor {
  /** 打开编辑器（双击 / F2）。返回是否成功进入编辑。 */
  open(cell: CellAddress, options: { selectAll?: boolean }): boolean
  /** 以首个键入字符为 draft 打开（键入即编辑）。 */
  beginWithDraft(cell: CellAddress, draft: string): boolean
  /** 提交当前编辑；moveAfter 提交后下移选区。 */
  commitActive(moveAfter: boolean): void
  /** 取消当前编辑（含 multiline 行高恢复）。 */
  cancelActive(): void
}

export const WEB_CELL_EDITOR_CONTRIBUTION = 'web.cell-editor'
export interface WebCellEditorContribution {
  readonly id: string
  readonly order: number
  create(deps: WebCellEditorRuntimeDeps): (WebCellEditor & WebFrameSync) | null
}
export function registerWebCellEditor(ctx, contribution): void
export function getWebCellEditorContributions(ctx): readonly WebCellEditorContribution[]
```

返回对象同时实现 `WebCellEditor`（命令）+ `WebFrameSync`（`attach` 建 `DomCellEditor`、`syncFrame` 每帧重定位/不可见取消、`destroy` 拆编辑器）。runtime 探测得 `this.cellEditController`（镜像 `resizeDrag`），并加入 `frameSyncs` 复用定位派发。

> 沿用 phase 3 的「一个对象多能力 + 按能力探测」模式：避免多 contribution 产出多实例。`web.cell-editor` 是 web 的 typed slot（web 知道"有编辑器槽位"，不知具体实现），与 `web.drag` 同性质。

**`WebCellEditorRuntimeDeps`（feature 自定义，从通用 kernel services 组装）**：

| 成员 | 性质 |
|---|---|
| `engine` / `host` | 已有（host.container 供 attach） |
| `autofitRows` | 通用（phase 3 已加） |
| `afterEngineMutation` / `refresh` | 通用 |
| `revealActiveCell()` | **新增通用**：封装 `ensureCellVisible(getSelectionScrollTarget())`，供提交后下移选区滚动可见；其它 feature 也可用 |
| `requestSyncPaint()` | **新增通用**：`showEditor` 打开前同步绘制一帧（原 `paintSync`）；通用 |
| `isBlocked()` | 已有（resize active 守卫） |
| `tryCustomEditor?(cell): boolean` | **editing 专名债务**：路由 `Grid.openCustomCellEditor` 经 `computeCellRect`(core)。唯一 editing-named 成员，记债待 command 契约 |

## Runtime 行为

移除（编辑专用，下放/委托）：

- `cellEditor?: DomCellEditor` 字段、`setCellEditor`、`new DomCellEditor` 接线（backend）。
- 生命周期方法 `openCellEditor` / `beginCellEditWithDraft` / `showCellEditor` / `commitCellEdit` / `cancelCellEdit` / `syncCellEditorPosition` / `computeCellEditorRect` / `syncCellEditorTheme`、`editingMultilineOriginalRowHeight` 状态。

改为委托（保留入口）：

- `handleHostKeyDown` 的 F2 → `this.cellEditController?.open(cell, { selectAll: false })`；键入 → `beginWithDraft(cell, key)`。
- `handleHostDoubleClick` → `open(hit, { selectAll: false })`。
- `DomCellEditor` 的回调（`onDraftChange`/`onCommitEnter`/`onCommitBlur`/`onCancel`）改由 **controller 自己接线**：`onDraftChange → engine.updateCellEditDraft`、`onCommitEnter → commitActive(true)`、`onCommitBlur → commitActive(false)`、`onCancel → cancelActive()`。runtime 的转发方法 `handleCellEditDraft` / `handleCellEditCommitEnter` / `handleCellEditCommitBlur` / `handleCellEditCancel` 随之删除（它们原本只是转发到生命周期方法）。
- 通用 `commitActiveEdit(moveSelection)` → 委托 `cellEditController?.commitActive(moveSelection)`；新增 `cancelActiveEdit()` → `cancelActive()`。fill/paste/nav 经 `commitActiveEdit` 提交编辑，行为不变。
- `tryOpenCustomCellEditor` 公共 API 保留（backend 自定义 editor 仍可用），内部经 `computeCellRect`。

新增/复用：

- 探测 `web.cell-editor` 贡献 → `this.cellEditController`，加入 `frameSyncs`（每帧定位）。
- `revealActiveCell` / `requestSyncPaint` 作为通用 deps services。

行为规则：

- 未安装 editing feature：键盘/双击入口的 `cellEditController?.…` no-op；无编辑器；`commitActiveEdit` no-op；不 crash。
- 已安装：行为与现状一致——双击/F2/键入起编、Enter/Tab 提交并下移、Esc 取消、blur 提交、multiline Alt+Enter + 提交 autofit + 取消恢复行高、滚动时编辑器跟随、单元格滚出视口取消。
- `Grid.destroy()` 幂等（不变量 #6）：`frameSync.destroy()` 销毁编辑器 DOM。

## fill 依赖重指向

phase 3 记的 follow-up：fill 的 `commitActiveEdit` service 当时接 `runtime.commitCellEdit`。本轮起 `commitActiveEdit` 委托 editing controller。**fill 代码不变**（仍调 `deps.commitActiveEdit`），仅 runtime 内部委托目标改变；未装 editing 时 no-op（fill 起拖前的"提交进行中编辑"变为无操作，符合预期）。

## 分阶段（基座/骨架先行）

1. **web 契约 + runtime 委托骨架（独立 commit）**：新增 `WebCellEditor` / `web.cell-editor` / `registerWebCellEditor` / `getWebCellEditorContributions`；`WebCellEditorRuntimeDeps` + 通用 `revealActiveCell` / `requestSyncPaint`；runtime 探测 `cellEditController`、键盘/双击/`commitActiveEdit` 改委托、加入 frameSyncs。此时无 contribution 实现 → 全 no-op（编辑暂时不可用，紧接第 2 步恢复）。
2. **feature 整竖切片（原子）**：建 `@novasheet/feature-editing`，`git mv` `DomCellEditor` + `cell-editor-style`，迁 `computeCellEditorRect`，合成 `EditingController`（WebCellEditor+WebFrameSync）；runtime 删生命周期方法/字段；测试迁移。
3. **默认安装**：`@novasheet/sheet` 装 `installEditingFeature`，backend 删 `DomCellEditor` 构造、自定义 editor 经 feature。
4. **docs + 全量 gates**。

> 第 1 步骨架把生命周期改为委托 `cellEditController`，但 controller 尚未存在 → 编辑能力会短暂不可用。因此**第 1、2 步在同一 plan 内连续执行、不在中间 commit**，由第 2 步（feature 落地 + runtime 删旧生命周期）作为首次绿提交（同 phase 3 Task 3 的原子性约定）。骨架的 web 契约本身（`WebCellEditor`/`web.cell-editor`/通用 services）可作为更早的独立绿 commit，因为它不触碰现有编辑路径。

## 测试策略

- web 骨架 test：未安装时键盘/双击/`commitActiveEdit` no-op、flush 不 crash；安装假 `WebCellEditor & WebFrameSync` 时 open/commit/cancel 被委托、attach/syncFrame/destroy 生命周期被驱动。
- `DomCellEditor` 单测迁 feature（保留旧断言）。
- `computeCellEditorRect` 单测（合并区锚定）。
- editing 行为 test（迁 feature，显式 `installEditingFeature`）：双击起编、Enter 提交下移、Esc 取消、键入即编辑、multiline 提交 autofit、取消恢复行高、滚动跟随/滚出取消。
- installer test：`installEditingFeature(ctx)` 注册 `web.cell-editor` 贡献。
- sheet test：默认 `Grid` 含 editing 贡献、自定义 editor 仍可用、`Grid.onFill`/编辑链路回归。

## 验收

- `@novasheet/feature-editing` 有独立 `package.json` / `build.ts` / `tsconfig.json` / `tsconfig.build.json` / `src/index.ts` / `installEditingFeature`。
- `DomCellEditor` / `cell-editor-style` 用 `git mv` 迁移，不重写编辑语义。
- `@novasheet/web` 除 `tryCustomEditor`（债务）外不出现 editing 专名 deps 成员；新增通用 `WebCellEditor` slot + 通用 services。
- `@novasheet/sheet` 默认安装；默认行为与自定义 editor 不变。
- 未安装 editing 时 runtime 不 crash。
- fill 的 `commitActiveEdit` 重指向 editing controller，fill 代码不变。
- `Grid.destroy()` 幂等。
- `bun run lint` / `bun run --filter '*' typecheck` / `bun test` 通过；全包 build 通过。
- `docs/architecture.md` 与路线图更新。

## 后续不在本轮（已知 follow-up）

- **keyboard 契约**：编辑键入口（F2/键入/Enter/Esc/Tab）仍在 kernel `handleHostKeyDown`，与 clipboard/undo/nav 混在一起；待 keyboard contribution 词汇表建立后，editing 自 claim（同 resize 键盘）。
- **自定义 editor 迁 command 契约**：`tryCustomEditor` / `tryOpenCustomCellEditor` 暂留 web（editing 专名债务），待 command 契约迁移。

## 自检

- 没有重写编辑语义；core edit kernel 完全不动。
- 没有让 `@novasheet/web` 依赖具体 feature；deps 仅保留 `tryCustomEditor`（债务，已记录）一个 editing-named 成员。
- 编辑器 DOM/几何/定位按交互/语义切分各归其位；定位复用 phase 3 的 `WebFrameSync`。
- 键盘入口暂留 kernel 是显式有界决策，非遗漏。
- 未安装 feature 的 no-op、destroy 幂等、fill 依赖重指向均有显式验收。
