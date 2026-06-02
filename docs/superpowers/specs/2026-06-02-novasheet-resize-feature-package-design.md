# NovaSheet Resize Feature Package Design

## 目标

把已验证的行高/列宽拖拽 resize 能力，从 `@novasheet/web` 的固定 runtime 构造中拆到默认安装的 feature package：`@novasheet/feature-resize`。

本次重构只组织旧代码，不重写 resize 行为。默认 `@novasheet/sheet` 的用户体验必须保持不变。

## 范围

本包拥有：

- `ResizeDrag` 行高/列宽拖拽状态机。
- 鼠标/触控 resize pointer lifecycle：pointerdown、pointermove、pointerup。
- 拖拽预览 indicator 与一次性 commit。
- 对应 runtime 行为测试 ownership。

本包不拥有：

- `DomHandleLayer`。它仍是 `@novasheet/web` 的 DOM handle 基础设施。
- `resize-handle-style`。样式和 DOM 变量仍留在 web host 层。
- `RowHeightPopover` / `ColumnWidthPopover`。
- 菜单项 `resize-row-height` / `resize-column-width`。
- 键盘 resize。它暂时仍由 `WebGridRuntime.handleResizeKeyboard` 处理，后续若菜单/handle action 一起拆包再迁移。

## 包边界

| 包 | 职责 |
|---|---|
| `@novasheet/core` | `ResizeHandleRect`、`MIN_RESIZE_SIZE`、engine resize mutation API |
| `@novasheet/web` | `DomHandleLayer`、runtime contribution contract、`WebGridRuntime` 派发 |
| `@novasheet/feature-resize` | `ResizeDrag` 与 `installResizeFeature(ctx)` |
| `@novasheet/sheet` | 默认安装 resize feature |

依赖方向：

```txt
@novasheet/core
  ↑
@novasheet/web ───────┐
  ↑                   │
@novasheet/feature-resize
  ↑
@novasheet/sheet
```

`@novasheet/web` 不依赖 `@novasheet/feature-resize`。`@novasheet/sheet` 负责组合默认 features。

## Contribution 设计

沿用第一包建立的 `WebDragContribution`：

- `@novasheet/web` 扩展 `WebDragRuntimeDeps`，补充 `handleLayer?: DomHandleLayer`。
- `@novasheet/feature-resize` 注册一个 drag contribution：
  - `id: 'resize'`
  - `order: 10`
  - `create(deps) => new ResizeDrag(...)`
- `WebGridRuntime` 从 contributions 中寻找具备 resize pointer API 的 drag，用于 `handleResizePointerDown/Move/Up`。

Resize drag 与普通 pointer hit-test drag 不同：

- `tryStart(event)` 仍返回 `false`，因为 resize 起点来自 `DomHandleLayer` 的独立 DOM pointerdown。
- runtime 的 resize public methods 继续存在，供 `DomHandleLayer` callback 调用。
- runtime 不再直接 `new ResizeDrag`。

## Runtime 行为

`WebGridRuntime` 需要一个内部 resize handle：

```ts
interface WebResizeDrag extends Drag {
  start(handle: ResizeHandleRect, pointerId: number, clientX: number, clientY: number): boolean
  movePointer(pointerId: number, clientX: number, clientY: number): boolean
  commitPointer(pointerId: number): boolean
}
```

处理规则：

- 未安装 resize feature 时：
  - `handleResizePointerDown/Move/Up` 是 no-op。
  - `isDragBlocked()` 不因 resize active 抛错。
  - runtime 仍可选择、滚动、编辑。
- 已安装 resize feature 时：
  - 行为保持原状：拖拽中只 show indicator，不 commit。
  - pointerup 后如果尺寸变化，调用 `engine.commitRowResize` 或 `engine.commitColumnResize`。
  - commit 后调用 `afterEngineMutation()`。

## 测试策略

TDD 验证分四层：

1. `@novasheet/feature-resize` installer test：`installResizeFeature(ctx)` 注册 `resize` contribution。
2. `ResizeDrag` 单元测试从 web 迁到 feature 包，保持旧断言。
3. runtime resize pointer tests 从 `packages/web/tests/runtime/WebGridRuntime.test.ts` 迁到 feature 包，并显式安装 `installResizeFeature(ctx)`。
4. `@novasheet/sheet` 增加默认安装断言：默认 `Grid` 的 context 含 `resize` contribution。

`@novasheet/web` 保留：

- `DomHandleLayer` DOM 测试。
- `resize-handle-style` 测试。
- `handleResizeKeyboard` 测试暂留或保持既有 coverage。
- host/container resize 测试。

## 验收

- `@novasheet/feature-resize` 有独立 `package.json`、`build.ts`、`tsconfig.json`、`tsconfig.build.json`。
- `ResizeDrag` 使用 `git mv` 迁移，不重写。
- `@novasheet/sheet` 默认安装 resize feature。
- 不安装 resize feature 时，runtime resize pointer methods 不抛错。
- `bun run lint` 通过。
- `bun run --filter '*' typecheck` 通过。
- `bun test` 通过。
- `@novasheet/core` / `@novasheet/web` / `@novasheet/feature-resize` / `@novasheet/canvas2d` / `@novasheet/sheet` build 通过。
- `docs/architecture.md` 与 feature package 总路线图更新。

## 后续不在本轮

- 把 resize 菜单项和 popover 拆为 feature action。
- 把 keyboard resize 纳入 feature action。
- 把 `DomHandleLayer` 从 web host 中移走。
- 把 row/column structure menu 与 resize menu 一起重组。

## 自检

- 没有扩大到菜单、popover、keyboard resize。
- 没有让 `@novasheet/web` 依赖具体 feature package。
- 默认行为由 `@novasheet/sheet` 继续安装 feature 保持。
- 未安装 feature 的 no-op 行为有明确测试。
