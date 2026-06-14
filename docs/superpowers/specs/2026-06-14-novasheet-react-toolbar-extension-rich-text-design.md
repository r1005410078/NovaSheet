# React Toolbar Extension + Rich Text Session Design

## 1. Problem

NovaSheet 的 rich-text 目标是 Google 表格式交互：用户在单元格内进入 inline 编辑，选中部分文本，然后用表格上方 React toolbar 修改粗体、斜体、下划线、字号、字体和颜色。

当前基础能力已具备：

| 能力 | 当前状态 |
| --- | --- |
| rich-text 存储 | `richText` cell attachment，value 仍是 plain string |
| rich-text renderer | `@novasheet/cell-kit` 读 `getAttachment('richText')` 分段绘制 |
| inline editor | `RichTextCellEditor` 使用 `contenteditable` |
| 内置 toolbar | `FloatingFormatToolbar` 挂在 editor 内部 |
| React toolbar | `NovaSheetToolbar` 固定 `defaultToolbarItems` + 封闭 `ToolbarActionId` |

问题不在 rich-text 数据模型，而在 React toolbar 没有扩展缝。若直接把 rich-text 按钮写进 `ToolbarActionId` 和 `useNovaExcelToolbar` switch，会让 toolbar 成为所有插件能力的中心分发器，后续 conditional formatting、custom cell type toolbar 都会继续污染这条封闭链。

## 2. Goals

1. 让 `NovaSheetToolbar` 支持外部扩展 item，而不要求扩展 action 进入内置 `ToolbarActionId` union。
2. 让 rich-text 提供 Google Sheets-like 外部 toolbar：编辑单元格时，外部 toolbar 可以控制当前 `contenteditable` 选区。
3. 保留现有内置 toolbar 行为不变；未传 extension 时视觉和 action 行为零变化。
4. rich-text 仍放在 `@novasheet/cell-kit`，不把 rich-text 类型或命令放进 core。
5. MVP 阶段提交时一次性写回 `richText` attachment + plain text，不做每次 toolbar 点击实时入 grid undo。

## 3. Non-goals

| 非目标 | 原因 |
| --- | --- |
| core 增加 typography 字段 | 已由 rich-text attachment ADR 否决 |
| `ToolbarActionId` 纳入 rich-text 命令 | 会继续封闭和膨胀 React toolbar |
| 对非编辑态 selection 做子串样式 | 子串选区只存在 active `contenteditable` 中 |
| sort/filter 下 selection full-span rich-text 精确 view→raw 修复 | 已有独立后续项，本设计不处理 |
| 多人协同 / IME 复杂编辑模型 | 当前 milestone 不覆盖 |

## 4. Architecture

### 4.1 React toolbar extension seam

`@novasheet/react` 的 toolbar 新增扩展 item 类型：

```ts
export interface ToolbarRenderContext {
  readonly state?: NovaSheetToolbarState
  readonly disabledActionIds: ReadonlySet<ToolbarActionId>
  readonly closePopover: () => void
}

export interface ToolbarExtensionItem {
  readonly id: string
  readonly separatorBefore?: boolean
  render(ctx: ToolbarRenderContext): ReactNode
}

export interface NovaSheetToolbarProps {
  readonly items?: readonly ToolbarItem[]
  readonly extensionItems?: readonly ToolbarExtensionItem[]
}
```

Rules:

| Rule | Decision |
| --- | --- |
| 内置 action | 仍走 `ToolbarAction` / `onAction` |
| extension action | 不进入 `ToolbarAction`；extension 自己闭包调用业务能力 |
| 默认 items | `items ?? defaultToolbarItems` |
| extension 位置 | MVP 追加在内置 items 之后；用 `separatorBefore` 控制分隔线 |
| popover | MVP extension item 自己管理；React toolbar 只提供渲染位置 |

这样 `NovaSheetToolbar` 是可扩展 UI 容器，但不是插件命令总线。

### 4.2 Rich-text editing session

`@novasheet/cell-kit` 新增 rich-text session 层，负责保存 active editor 引用和选区。

```ts
export interface RichTextEditingSession {
  readonly active: boolean
  saveSelection(): void
  restoreSelection(): boolean
  toggleInlineStyle(kind: 'bold' | 'italic' | 'underline' | 'strikethrough'): void
  setColor(color: string): void
  setFontSize(size: number): void
  setFontFamily(fontFamily: string): void
  getActiveAttrs(): TextRunAttrs
}

export interface RichTextSessionStore {
  getSession(): RichTextEditingSession | null
  subscribe(listener: () => void): () => void
}
```

React surface:

```tsx
<RichTextToolbarProvider>
  <NovaSheetToolbar extensionItems={[richTextToolbarExtension()]} />
  <NovaSheetGrid cellEditors={{ text: richTextExtension.editor }} />
</RichTextToolbarProvider>
```

`RichTextCellEditor` 在 mount 时注册 session，在 unmount 时清除 session。外部 toolbar 的按钮通过 provider 取 active session，再调用 `toggleInlineStyle` / `setFontSize` 等。

### 4.3 Selection handling

外部 toolbar 点击会抢焦点，这是最大风险。MVP 采用三层防护：

| 防护 | 行为 |
| --- | --- |
| toolbar button `onMouseDown.preventDefault()` | 避免按钮点击使 `contenteditable` blur |
| editor 监听 `selectionchange` / `mouseup` / `keyup` | 保存 last non-collapsed Range |
| command 前 `restoreSelection()` | 若当前 selection 丢失，恢复 last Range 再应用样式 |

若 selection 不存在或 collapsed，子串样式命令 no-op。后续可扩展为 collapsed selection 设置 typing mark，但 MVP 不做。

### 4.4 Rich-text toolbar items

MVP 提供 `richTextToolbarExtension()`，返回一组 toolbar extension items：

| Control | Action | Data model |
| --- | --- | --- |
| Bold | `toggleInlineStyle('bold')` | `attrs.bold` |
| Italic | `toggleInlineStyle('italic')` | `attrs.italic` |
| Underline | `toggleInlineStyle('underline')` | `attrs.underline` |
| Strikethrough | `toggleInlineStyle('strikethrough')` | `attrs.strikethrough` |
| Text color | `setColor(color)` | `attrs.color` |
| Font size | `setFontSize(size)` | `attrs.fontSize` |
| Font family | `setFontFamily(fontFamily)` | `attrs.fontFamily` |

按钮 disabled 条件：无 active rich-text session 时 disabled。状态高亮来自 `getActiveAttrs()`。

### 4.5 Editor UI change

`RichTextCellEditor` 内部 toolbar 改成可选：

```ts
export interface RichTextEditorOptions {
  readonly showInlineToolbar?: boolean
}
```

默认建议：

| 使用面 | 默认 |
| --- | --- |
| `richTextExtension.editor` | `showInlineToolbar: false` |
| standalone demo / legacy story | 可显式打开 inline toolbar |

这样 Google Sheets-like 体验优先使用外部 React toolbar。旧的 `FloatingFormatToolbar` 保留为低层组件和测试载体，后续可复用其 DOM wrap helper。

## 5. Data Flow

### 5.1 Open editor

1. Grid 通过 `cellEditors.text` 打开 `RichTextCellEditor`。
2. editor 从 `value` + `getAttachment('richText')` 构造 HTML。
3. editor 注册 active `RichTextEditingSession`。
4. React toolbar extension 订阅 session store，按钮变为 enabled。

### 5.2 Apply toolbar command

1. 用户在 `contenteditable` 里选中子串。
2. session 保存 selection。
3. 用户点击外部 toolbar 按钮。
4. button `onMouseDown.preventDefault()`，command 调 `restoreSelection()`。
5. session 用现有 wrap/toggle 算法修改 DOM span。
6. editor 保持打开；不立即写 attachment。

### 5.3 Commit editor

1. `Enter` 或 blur 提交。
2. editor 调 `htmlElementToRichText()` 得到 `{ text, runs }`。
3. 先 `setAttachment('richText', runs)`，再 `commit(text)`。
4. Grid close editor，renderer 下帧读 attachment 分段绘制。

## 6. Error Handling

| Case | Behavior |
| --- | --- |
| 无 active session | rich-text extension controls disabled |
| selection collapsed | command no-op |
| selection 不在当前 editor 内 | command no-op |
| 恢复 Range 失败 | command no-op，不抛 |
| unsupported font family | 仍写入 string；renderer 按 canvas font fallback |
| toolbar extension render 抛错 | 不做局部 ErrorBoundary；由 React 调用方处理 |

## 7. Testing Strategy

| Layer | Test |
| --- | --- |
| React toolbar unit | `NovaSheetToolbar` renders `extensionItems`, keeps default items when `items` omitted |
| React toolbar type | custom extension item does not require `ToolbarActionId` |
| cell-kit session unit | active session register/unregister; command disabled without session |
| rich-text editor DOM | external command restores saved selection and wraps selected substring |
| Excel L3c | registered rich-text extension + external toolbar bold selected substring + commit renders bold |
| Storybook | `Cell-Kit/RichText` story shows external toolbar above grid |

Commands for implementation verification:

```bash
bun test packages/react/tests/features/toolbar packages/cell-kit/tests/rich-text packages/react/tests/excel
bun run --filter '*' typecheck
bun run lint
```

## 8. Migration

| Existing API | Behavior |
| --- | --- |
| `NovaSheetToolbar` with no new props | unchanged |
| `defaultToolbarItems` | unchanged export |
| `ToolbarAction` | unchanged; no rich-text commands added |
| `richTextExtension.editor` | uses external-toolbar-first default |
| `FloatingFormatToolbar` | retained export, not removed |

Storybook `Cell-Kit/RichText` should be updated from internal floating toolbar demo to external toolbar demo. If a legacy story is useful, add a second story named `Inline toolbar legacy`.

## 9. ADR

### ADR-A: Extension items render UI, not toolbar actions

Accepted. Extension commands stay in extension closures instead of entering `ToolbarAction`.

Reason: rich-text command target is active `contenteditable` selection, not grid range mutation. Forcing it through `useNovaExcelToolbar` would mix grid range commands and editor-local commands.

### ADR-B: Session lives in cell-kit, not react toolbar

Accepted. React toolbar should not know rich-text internals. `@novasheet/cell-kit` owns `RichTextEditingSession` because it owns editor DOM, TextRun attrs, and HTML serialization.

### ADR-C: Commit-time undo only for MVP

Accepted. Toolbar clicks mutate editor DOM only. Grid undo receives the final edit on commit. This matches current custom editor behavior and avoids introducing per-keystroke/per-style undo semantics.

## 10. Implementation Slices

1. React toolbar extension seam.
2. Rich-text session store + provider.
3. Rich-text editor registers session and hides inline toolbar by default.
4. Rich-text external toolbar extension items.
5. Storybook external toolbar demo.
6. L3c scenario/test update.
