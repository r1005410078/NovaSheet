# Phase 4.2 — Undo / Redo 设计

**日期:** 2026-05-21
**所属阶段:** Phase 4.2(剪贴板与结构操作 / Undo-Redo)
**前置:** Phase 3.4(行高列宽 resize)、Phase 3.5(单元格编辑)、Phase 4.1(剪贴板 Cut/Copy/Paste)均已发版

---

## 1. 目标与范围

提供 Sheets/Excel 风格的撤销 / 重做,覆盖用户能从 UI 触发的全部数据写入与几何 resize:

| 操作                                                   | 入口                                          | 是否进 undo 栈 |
| ------------------------------------------------------ | --------------------------------------------- | -------------- |
| Cell edit commit(Enter / blur 提交)                    | `engine.commitCellEdit()`                     | 是             |
| Cut(包括 Backspace / Delete 清除选区,4.1 已经走同路径) | `engine.clearRange(range)`                    | 是             |
| Paste                                                  | `engine.applyPaste(target, payload)`          | 是             |
| Row height resize(拖拽 pointerup / handle 键盘 arrow)  | 新 `engine.commitRowResize(row, old, new)`    | 是             |
| Column width resize(同上)                              | 新 `engine.commitColumnResize(col, old, new)` | 是             |
| `engine.setRowHeight` / `setColumnWidth` 直调          | preview / autofit 路径                        | 否             |
| 滚动 / 选区移动 / 主题切换 / 冻结切换 / 视口尺寸变化   | 现有接口                                      | 否             |
| Fill handle / 排序 / 行列结构变更                      | 后续 Phase 4.3-4.5                            | 不在 4.2 范围  |

### 1.1 非目标(明确不做)

- 编辑过程中的字符级 undo —— 由浏览器 input 原生承担(Edit 中 `Cmd/Ctrl+Z` 不被 Grid 拦截)。
- Coalescing 连续 resize keystroke 为一步 undo。每次 Arrow 一步,与 Sheets 一致。
- Autofit 的 undo —— 没有 UI 入口,且语义("autofit 等同于多个 setRowHeight")存在歧义,留给未来 Phase。
- Selection-only 操作进栈(Sheets/Excel 均不做)。

---

## 2. 命令模型

### 2.1 UndoCommand discriminated union

Command **不是 class**,是纯数据 union。理由:JSON-serializable(未来 server-sync 直接传输);TS discriminated union 的类型收窄足够清晰;消除 class 实例的样板代码。

```ts
// packages/core/src/undo/UndoCommand.ts
import type { CellValue } from '../data/Schema'
import type { CellRange } from '../interaction/SelectionModel'

export type CellWrite = {
  readonly rowIndex: number
  readonly fieldId: string
  readonly value: CellValue
}

export type UndoCommand =
  | { kind: 'editCell'; rowIndex: number; fieldId: string; before: CellValue; after: CellValue }
  | { kind: 'clearRange'; range: CellRange; before: ReadonlyArray<CellWrite> }
  | {
      kind: 'paste'
      target: CellRange
      before: ReadonlyArray<CellWrite>
      after: ReadonlyArray<CellWrite>
    }
  | { kind: 'resizeRow'; rowIndex: number; before: number; after: number }
  | { kind: 'resizeColumn'; colIndex: number; before: number; after: number }
```

### 2.2 设计决策

**`resizeColumn` 使用 colIndex 而非 fieldId** —— 与 `resizeRow` 对称,与 axis 直接对话。当前 schema 不可变,二者等价;未来 Phase 6 schema-edit 落地时,undo 栈在任何 schema 改动前都会被清空(见 §3.4),无需跨 schema 兼容。

**clearRange / paste 只记录被实际改写的 cell** —— Paste 中类型不匹配跳过的格子不进 before/after,clearRange 中原本就是 `null` 的 cell 也不进 before。节省内存,且 undo 时"不动 == 不动",语义正确。

**编辑写入相同值仍 push 一步** —— 与 Sheets/Excel 一致。用户按下 Enter 就期待一步 undo 历史,即使值未变。

---

## 3. UndoStack 模块

### 3.1 接口

```ts
// packages/core/src/undo/UndoStack.ts
export class UndoStack {
  private undo: UndoCommand[] = []
  private redo: UndoCommand[] = []
  private readonly capacity = 100

  push(cmd: UndoCommand): void // push undo + clear redo + 超出容量挤掉最早
  popUndo(): UndoCommand | undefined // pop undo + push redo
  popRedo(): UndoCommand | undefined // pop redo + push undo
  canUndo(): boolean
  canRedo(): boolean
  clear(): void
}
```

### 3.2 容量

固定 100。超过时 `Array.shift()` 最早一条,redo 栈在 `push` 新命令时整体清空。

### 3.3 边界

- `popUndo` / `popRedo` 在空栈返回 `undefined`。
- `clear()` 双栈清空,在 `engine.setData()` 和(隐含地)engine 销毁时调用。
- UndoStack **自身不感知 engine**,只是双栈数据结构 + 容量管理 + redo-on-push 清空。所有"如何反向执行"的逻辑由 engine 拥有。

---

## 4. Engine 集成

### 4.1 新增接口

```ts
// packages/core/src/engine/GridEngine.ts
undo(): UndoCommand | undefined
redo(): UndoCommand | undefined
canUndo(): boolean
canRedo(): boolean

commitRowResize(rowIndex: number, oldHeight: number, newHeight: number): void
commitColumnResize(colIndex: number, oldWidth: number, newWidth: number): void
```

`undo()` / `redo()` 返回执行的 command 供 runtime 发对外事件;空栈返回 `undefined`。

### 4.2 改造现有 mutation 入口

| 入口                                       | 原行为                                     | 改造                                                                                                         |
| ------------------------------------------ | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `commitCellEdit()`                         | `data.updateCell(row, fieldId, parsed)`    | 写入前 `before = data.getCell(...)`;`isMutableDataSource` 守卫不变;写入后 push `editCell`                    |
| `clearRange(range)`                        | 双循环 `data.updateCell(r, fieldId, null)` | 先扫一遍收集非 null cell 为 `before: CellWrite[]`,空数组则不 push;否则写入 + push `clearRange`               |
| `applyPaste(target, payload)`              | 见 4.1 spec                                | 现有"跳过类型不匹配"逻辑保留;只把**实际写入**的格子收进 before/after,push `paste`(若 length === 0 则不 push) |
| `setRowHeight` / `setColumnWidth`          | `axis.setSize`                             | **不变**——保持非记录,autofit / preview 继续使用                                                              |
| **新** `commitRowResize(row, old, new)`    | —                                          | `if (old === new) return;` `rowsAxis.setSize(row, new);` push `resizeRow`                                    |
| **新** `commitColumnResize(col, old, new)` | —                                          | 对称,使用 `colsAxis.setSize(col, new)`                                                                       |

### 4.3 undo / redo 反向执行

`undo()` pop 一条 cmd 后,按 `cmd.kind` 分发:

- **editCell** → `data.updateCell(rowIndex, fieldId, before)`;选区:`selection.selectCell({rowIndex, colIndex: schema.fields.findIndex(f=>f.id===fieldId)})`。schema 当前不可变,colIndex 解析稳定;Phase 6 schema-edit 落地前的任何 schema 变更都会先触发 `setData()` 清栈,因此存活栈条目永远对应当前 schema。
- **clearRange** → 遍历 `before` 还原每个 cell;选区:`selectCell({startRow, startCol})` + extend 到 endRow/endCol(即恢复 selectedRange = range)
- **paste** → 遍历 `before` 还原;选区:同 clearRange,target = 命令的 target
- **resizeRow** → `rowsAxis.setSize(rowIndex, before)`;选区不动
- **resizeColumn** → `colsAxis.setSize(colIndex, before)`;选区不动

`redo()` 对称,使用 `after`(editCell 的 `after`,clearRange 的"全设 null",paste 的 `after`,resize 的 `after`)。

### 4.4 防递归

undo/redo 内部直接调 `data.updateCell` / `axis.setSize`,**不经过** `commitCellEdit` / `clearRange` / `applyPaste` / `commitRowResize` / `commitColumnResize` 等记录入口,因此自然不会再次 push。无需 suppress flag。

### 4.5 setData 清栈

`DefaultGridEngine.setData()` 末尾 `this.undoStack.clear()`。其他 setter(`setTheme` / `setFrozen` / `setViewportSize` / `setHeaderHeight`)不清。

---

## 5. Web 层接入

### 5.1 键盘路由(`WebGridRuntime` keydown)

| 组合键                                   | 行为                                                                      |
| ---------------------------------------- | ------------------------------------------------------------------------- |
| `Cmd/Ctrl+Z`,非 Shift,**非 cellEditing** | `if (canUndo()) { runtime.undo(); preventDefault }`;空栈不 preventDefault |
| `Cmd/Ctrl+Z`,非 Shift,**cellEditing**    | 不拦截,交给 input 原生 undo                                               |
| `Cmd/Ctrl+Shift+Z`,非 cellEditing        | `redo()`                                                                  |
| `Ctrl+Y`(非 Mac 风格),非 cellEditing     | `redo()`                                                                  |

`Cmd+Y` 在 Mac 是其他系统快捷,不做 redo;`Cmd+Shift+Z` 才是 Mac 上的 redo。

### 5.2 Runtime API

```ts
runtime.undo(): void  // engine.undo() + afterEngineMutation + emit 'undo' 事件
runtime.redo(): void  // 对称
runtime.canUndo(): boolean  // 委派
runtime.canRedo(): boolean  // 委派
```

`afterEngineMutation` 是 Phase 4.1 已有的钩子(重算 spacer / remap scroll / 重绘),复用即可。

### 5.3 Resize 路径改造

`handleResizePointerUp` 在 `previewSize !== startSize` 时:

```ts
if (handle.kind === 'row') {
  this.engine.commitRowResize(handle.rowIndex!, startSize, previewSize)
} else {
  const colIndex = this.engine.getColumnIndex(handle.fieldId!)
  this.engine.commitColumnResize(colIndex, startSize, previewSize)
}
this.afterEngineMutation()
```

`handleResizeKeyboard` 同样切换到 `commitRowResize / commitColumnResize`(每次 Arrow 一步)。

`autofitRows` 内部的 `applyHeight` 继续走 `engine.setRowHeight`(非记录路径),不变。

### 5.4 Grid 公开 API

```ts
// packages/web/src/Grid.ts
undo(): void
redo(): void
canUndo(): boolean
canRedo(): boolean

onUndo(handler: (e: UndoEvent) => void): () => void
onRedo(handler: (e: RedoEvent) => void): () => void

// 类型
export type UndoEvent = { command: UndoCommand }
export type RedoEvent = { command: UndoCommand }
// UndoCommand 从 @novasheet/core 公开 re-export
```

事件 payload 携带 command,使用者可据 `command.kind` 做 toast / server-sync / 自定义 UI 状态。

### 5.5 Context menu

4.2 **不**在右键菜单里加 Undo/Redo 条目。Sheets / Excel 也只通过键盘 + Edit menu 暴露(NovaSheet 暂无 Edit menu)。Storybook 故事中以两个外部按钮演示状态绑定。

---

## 6. 错误与边界

### 6.1 非 MutableDataSource

- `commitCellEdit` / `clearRange` / `applyPaste` 在非 mutable 源上已经 short-circuit,不 push。
- `commitRowResize` / `commitColumnResize` 只动 axis,不依赖 mutable,仍正常 push。

### 6.2 No-op 情况

| 场景                         | 行为                                                                        |
| ---------------------------- | --------------------------------------------------------------------------- |
| editCell 写入相同值          | **仍 push**(与 Sheets/Excel 一致)                                           |
| clearRange 范围全空          | 不 push(before 为空数组)                                                    |
| applyPaste 全部跳过          | 不 push(before/after 均为空);4.1 的 `onPasteSkipped` 事件不受影响,正常 emit |
| commitRowResize 前后尺寸相等 | 不 push                                                                     |
| undo / redo 空栈             | 返回 `undefined`,不发事件,**不 preventDefault** —— 给宿主页面机会处理       |

### 6.3 Strict Mode mount → destroy → mount

新 engine 新栈,无残留状态。`Grid.destroy()` 时 engine 引用一并释放,栈被 GC。

### 6.4 Capacity overflow

第 101 次 push 时 `undo.shift()` 弹出最早一条。redo 栈不参与 capacity 检查(redo 长度受 undo 推动天然受限)。

---

## 7. 测试

### 7.1 单元测试

**packages/core/tests/undo/UndoStack.test.ts**

- push / popUndo / popRedo 基础对偶
- push 新 cmd 后 redo 清空
- 容量 100:第 101 条挤掉第 1 条
- `clear()` 双栈空
- `canUndo` / `canRedo` 与栈非空一致

**packages/core/tests/engine/DefaultGridEngine.undo.test.ts**

- editCell push + undo 还原 + active 回到该 cell + canRedo
- editCell 写入相同值仍 push(行为锁定)
- clearRange 部分非空:undo 恢复;空 cell 不进 before
- clearRange 全空范围不 push
- applyPaste 类型匹配 + 跳过格子:只记录被改写;undo / redo 对应
- commitRowResize / commitColumnResize:相等不 push,不同 push 一步
- setData 清栈
- undo / redo 不再触发 push(防递归)
- 非 MutableDataSource:editCell/clearRange/paste 不 push;resize 仍 push
- 容量上限:push 101 → 第 1 条被挤掉

### 7.2 集成测试

**packages/web/tests/runtime/WebGridRuntime.undo.test.ts**

- Cmd+Z 路由:cellEditing 时不 preventDefault;not editing 时调 undo
- Cmd+Shift+Z / Ctrl+Y 路由 redo
- 空栈 Cmd+Z 不 preventDefault
- resize pointerup → `commitRowResize` / `commitColumnResize`(engine spy)
- resize keyboard arrow → 同上
- onUndo / onRedo 事件触发,payload.command.kind 正确

**packages/web/tests/Grid.undo.test.ts**

- Grid.undo / redo / canUndo / canRedo 委派 runtime
- onUndo / onRedo 返回 unsubscribe
- 端到端流:edit → cut → paste → 3 次 undo 回到初态;再 3 次 redo 回到末态

### 7.3 Storybook

**apps/storybook/stories/Grid/Undo.stories.ts**

- Toolbar 外置 Undo / Redo 按钮,绑定 `Grid.canUndo()` / `canRedo()`
- 状态显示最近一次 UndoEvent.command.kind
- 鼓励用户用键盘 + 按钮交叉验证

---

## 8. 文件清单

**新增:**

- `packages/core/src/undo/UndoStack.ts`
- `packages/core/src/undo/UndoCommand.ts`
- `packages/core/tests/undo/UndoStack.test.ts`
- `packages/core/tests/engine/DefaultGridEngine.undo.test.ts`
- `packages/web/tests/runtime/WebGridRuntime.undo.test.ts`
- `packages/web/tests/Grid.undo.test.ts`
- `apps/storybook/stories/Grid/Undo.stories.ts`

**修改:**

- `packages/core/src/engine/GridEngine.ts` — 接口加 undo/redo/canUndo/canRedo/commitRowResize/commitColumnResize
- `packages/core/src/engine/DefaultGridEngine.ts` — 实现 + 5 个 mutation 入口注入 push
- `packages/core/src/index.ts` — 导出 UndoCommand / CellWrite
- `packages/web/src/runtime/WebGridRuntime.ts` — 键盘路由、resize 路径、undo/redo + 事件
- `packages/web/src/Grid.ts` — public API
- `packages/web/src/grid/GridController.ts` — controller 接口
- `packages/web/src/backends/Canvas2DBackend.ts` — 委派
- `README.md` — Phase 4.2 状态更新

---

## 9. 风险与已知局限

- **autofit 不进 undo 栈** —— 未来若加 UI 入口需重新审视。当前没人能从 UI 触发,搁置。
- **Edit 中 Ctrl/Cmd+Z 交给浏览器** —— 编辑过程中无法 undo 上一次 commit(用户需先 Esc 或 Enter 退出编辑)。与 Sheets 行为一致,可接受。
- **resize 键盘 arrow 不 coalesce** —— 连续 5 次 Arrow Right 是 5 步 undo。与 Sheets 一致,但未来可在 plan 阶段考虑"500ms 内连续 arrow 合并"。
- **跨 setData 不能 undo** —— 设计选择,后续如果需要长会话历史(server-sync)可重做。
