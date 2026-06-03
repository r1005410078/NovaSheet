# Context Menu Feature Package Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **总路线图：** `docs/superpowers/plans/2026-06-02-novasheet-feature-package-roadmap.md` phase 6。完成并满足打勾规则后，在总路线图将 phase 6 标为 `[x]`。

**Goal:** 把右键菜单 DOM 竖切片与打开/汇聚/派发逻辑迁到 `@novasheet/feature-context-menu`，在 `@novasheet/web` 建立 `web.menu-item` + `web.context-menu` 契约词汇表。

**Architecture:** `web.menu-item` 按 order 汇聚 `ContextMenuItem`；`web.context-menu` 单 controller 独占 `DomContextMenuLayer` 与 `handleHostContextMenu`。runtime 保留 sort/filter/structure/clipboard **动作** deps（薄壳），列/行/单元格项生成仍调用 core `get*ContextMenuItems` + `ViewPipeline`（经 feature 内默认 provider 注册）。未安装 feature 时 host 右键 no-op。

**Tech Stack:** Bun workspaces、TypeScript strict + `verbatimModuleSyntax`、`bun:test`。

**设计依据：** `docs/superpowers/specs/2026-06-03-novasheet-context-menu-feature-package-design.md`（UX 细节见 `docs/superpowers/specs/2026-05-17-context-menu-design.md`）。

**已知计划风险（STOP+ASK）：**

- Task 3 大原子：`git mv DomContextMenuLayer` 后 backend 必须同提交接好 controller，否则默认 Grid 右键路径断。
- `handleContextMenuSelected` 与列头 sort/filter/structure 分支顺序必须与现 `WebGridRuntime.ts:981+` 一致；任何「先外抛 onContextMenuAction」顺序变化会改公共语义。
- `openContextMenuAt` / `getRowHeaderContextMenuItems` 等 **Grid 公共 API** 仍走 runtime→engine 路径；若计划要求迁到 controller，须确认 `GridController` 签名不变（仅内部委托）。
- 编辑中右键会先 `commitCellEdit`：须继续调用 `commitActiveEdit`（editing feature），未安装 editing 时为 no-op。
- Portal 菜单挂 `document.body`（spec §6.5）：controller `attach` 必须用 `host.container.ownerDocument`，不能误绑 grid container。

---

## Scope

**In scope**

- `WebMenuItem` / `web.menu-item` 注册与汇聚工具（web）。
- `WebContextMenu` / `web.context-menu` 注册与 runtime 探测（web）。
- 新建 `@novasheet/feature-context-menu`：`git mv` `DomContextMenuLayer`、`context-menu-style`；`ContextMenuController`；`installContextMenuFeature` + 默认 menu-item providers。
- `WebGridRuntime` 删除 `contextMenuLayer` 字段、`setContextMenuLayer`、`handleHostContextMenu`/`handleContextMenuSelected` 大段实现（改委托 controller）；保留 `openContextMenuAt` 等公共方法薄壳。
- `Canvas2DBackend` 删除 layer 构造；`installDefaultExtensions` 增加一行。
- 测试 ownership 迁移；`docs/architecture.md` 更新。

**Out of scope**

- `feature-sort-filter` / `feature-structure` 拆包（phase 7–8）。
- `web.keyboard` 与 Cmd+C/X/V 迁出 kernel（债务；本阶段可留 `handleHostKeyDown` 仍调 `handleClipboard*`）。
- `FilterPopover` / resize 行高列宽 popover 迁包。
- phase 14 reorder/resize 菜单回补。
- 让 `feature-clipboard` 单独注册 menu-item（可选 follow-up；默认 provider 已覆盖 cell 三项）。

---

## Current File Map

```txt
packages/core/src/interaction/ContextMenuModel.ts          # 保留：项生成纯函数
packages/web/src/interaction/DomContextMenuLayer.ts        # 要搬
packages/web/src/host/context-menu-style.ts              # 要搬
packages/web/src/runtime/WebGridRuntime.ts               # handleHostContextMenu / handleContextMenuSelected / layer 字段
packages/web/src/index.ts
packages/web/tests/interaction/DomContextMenuLayer.test.ts # 要搬
packages/web/tests/runtime/WebGridRuntime.test.ts        # Phase 4.0 contextmenu 段（部分迁 feature）
packages/sheet/src/backends/Canvas2DBackend.ts           # new DomContextMenuLayer + setContextMenuLayer
packages/sheet/src/defaults/installDefaultExtensions.ts
packages/feature-editing/tests/WebGridRuntime.editing.test.ts  # mock setContextMenuLayer — 改 install context-menu
tsconfig.base.json / packages/sheet/{package.json,build.ts}
```

## Target File Map

```txt
packages/web/src/menu/WebMenuItem.ts                     # 新：provider 契约 + register/get + mergeMenuItems
packages/web/src/menu/WebContextMenu.ts                  # 新：controller 契约 + register/get
packages/web/tests/menu/WebMenuItem.test.ts
packages/web/tests/menu/WebContextMenu.test.ts

packages/feature-context-menu/
  package.json / build.ts / tsconfig.json / tsconfig.build.json
  src/index.ts
  src/installContextMenuFeature.ts
  src/ContextMenuController.ts
  src/DomContextMenuLayer.ts              # git mv
  src/context-menu-style.ts               # git mv
  src/defaultMenuProviders.ts             # cell / column / row 默认 provider
  tests/installContextMenuFeature.test.ts
  tests/ContextMenuController.test.ts     # 从 runtime 行为测试抽离
  tests/DomContextMenuLayer.test.ts       # git mv
  tests/WebGridRuntime.context-menu.test.ts
```

---

## Task 1: `web.menu-item` 契约与汇聚（web 独立绿提交）

**Files:**

- Create: `packages/web/src/menu/WebMenuItem.ts`
- Modify: `packages/web/src/index.ts`
- Test: `packages/web/tests/menu/WebMenuItem.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
import { describe, expect, it } from 'bun:test'
import { createSheetContext, type ContextMenuContext } from '@novasheet/core'
import {
  mergeMenuItems,
  registerWebMenuItem,
  getWebMenuItemContributions,
  type WebMenuItemProvider,
} from '@novasheet/web'

describe('web.menu-item', () => {
  it('按 order 注册并 merge 去重 id（后者覆盖前者）', () => {
    const ctx = createSheetContext()
    const a: WebMenuItemProvider = {
      id: 'a',
      order: 10,
      getItems: () => [{ id: 'copy', label: 'A', disabled: false }],
    }
    const b: WebMenuItemProvider = {
      id: 'b',
      order: 20,
      getItems: () => [{ id: 'paste', label: 'B', disabled: false }],
    }
    registerWebMenuItem(ctx, b)
    registerWebMenuItem(ctx, a)
    const ctxMenu = { targetKind: 'cell' } as ContextMenuContext
    const items = mergeMenuItems(
      getWebMenuItemContributions(ctx).map((p) => p.getItems(ctxMenu, {} as never)),
    )
    expect(items.map((i) => i.id)).toEqual(['copy', 'paste'])
  })
})
```

Run: `bun test packages/web/tests/menu/WebMenuItem.test.ts` → FAIL。

- [ ] **Step 2: 实现 `WEB_MENU_ITEM_CONTRIBUTION`、`registerWebMenuItem`、`mergeMenuItems`**

`mergeMenuItems` 规则：扁平拼接；相同 `id` 时后者覆盖；保留 `separatorAfter` 以最后一项为准。

- [ ] **Step 3: 跑绿 + commit**

`bun test packages/web/tests/menu/WebMenuItem.test.ts`

```bash
git commit -m "$(cat <<'EOF'
feat(web): 新增 web.menu-item 贡献点与项汇聚

EOF
)"
```

---

## Task 2: `web.context-menu` 契约与 runtime 探测骨架（web 独立绿提交）

**Files:**

- Create: `packages/web/src/menu/WebContextMenu.ts`
- Modify: `packages/web/src/runtime/WebGridRuntime.ts`（仅加字段 + 构造探测 + 薄委托桩，**暂不删**旧 layer 逻辑）
- Modify: `packages/web/src/index.ts`
- Test: `packages/web/tests/menu/WebContextMenu.test.ts`
- Test: `packages/web/tests/runtime/WebGridRuntime.context-menu-stub.test.ts`（新建，验证未安装 no-op）

- [ ] **Step 1: 写失败测试 — 注册与读取**

```ts
import { describe, expect, it } from 'bun:test'
import { createSheetContext } from '@novasheet/core'
import { registerWebContextMenu, getWebContextMenuContributions } from '@novasheet/web'

it('registerWebContextMenu 按 order 排序', () => {
  const ctx = createSheetContext()
  registerWebContextMenu(ctx, { id: 'b', order: 20, create: () => null })
  registerWebContextMenu(ctx, { id: 'a', order: 10, create: () => null })
  expect(getWebContextMenuContributions(ctx).map((c) => c.id)).toEqual(['a', 'b'])
})
```

- [ ] **Step 2: 定义 `WebContextMenu` 接口**

```ts
export interface WebContextMenu {
  attach(container: HTMLElement): void
  destroy(): void
  applyTheme(theme: Theme): void
  close(): void
  isOpen(): boolean
  handleHostContextMenu(event: WebPointerEvent): void
  handleAction(id: ContextMenuAction): void
  /** 编程打开单元格菜单（Shift+F10 预留；现 Grid.openContextMenuAt 用）。 */
  openAtCell?(rowIndex: number, fieldId: string): void
}
```

`WebContextMenuRuntimeDeps` 需包含 controller 迁代码所需的 **全部** runtime 服务（从现 `handleHostContextMenu` / `handleContextMenuSelected` grep 列出）：

- `engine`, `host`, `viewPipeline?`, `sortLayer?`, `filterLayer?`
- `refresh`, `afterEngineMutation`, `commitActiveEdit`
- `isDragBlocked`, `collectHiddenInViewColRange`
- `onContextMenuAction?`
- `clipboardCopy/Cut/Paste`（`() => Promise<boolean>` 薄委托）
- `invokeRowHeaderContextMenuAction`, `invokeColumnHeaderContextMenuAction`
- `openFilterPopover`, `filterPopoverFieldId` setter（或封装 `openFilterPopoverForColumn`）
- `focusScrollHost`

- [ ] **Step 3: runtime 构造时 `contextMenuController = contributions.map(create).find(non-null)`**

`handleHostContextMenu` 改为：

```ts
this.contextMenuController?.handleHostContextMenu(event) ?? undefined
```

未安装时直接 return（**不**访问 `contextMenuLayer`）。

保留旧 `setContextMenuLayer` 路径直至 Task 4：若 `contextMenuController` 为空且 `contextMenuLayer` 存在，走旧逻辑（过渡一步可选；若 Task 3–4 同 sprint 可跳过过渡，Task 2 仅测 no-op）。

- [ ] **Step 4: 跑绿 + commit**

```bash
git commit -m "$(cat <<'EOF'
feat(web): 新增 web.context-menu 贡献点与 runtime 探测

EOF
)"
```

---

## Task 3: 新建 `feature-context-menu` 并落地 `ContextMenuController`（大原子提交）

**Files:**

- Create: `packages/feature-context-menu/**`（package 脚手架，照 `feature-clipboard` 复制改 name）
- Move: `DomContextMenuLayer.ts`, `context-menu-style.ts`, `DomContextMenuLayer.test.ts`
- Create: `ContextMenuController.ts`, `defaultMenuProviders.ts`, `installContextMenuFeature.ts`
- Modify: `packages/web/src/runtime/WebGridRuntime.ts` — **删除** `handleHostContextMenu`/`handleContextMenuSelected` 实现体，改 `createWebContextMenuDeps()` + 委托
- Modify: `packages/web/src/runtime/WebGridRuntime.ts` — 删除 `contextMenuLayer` / `setContextMenuLayer` / `syncContextMenuTheme` 内联 layer 调用
- Modify: `packages/sheet/src/backends/Canvas2DBackend.ts`
- Modify: `packages/sheet/src/defaults/installDefaultExtensions.ts`
- Modify: `tsconfig.base.json`, `packages/sheet/package.json`, `packages/sheet/build.ts`

- [ ] **Step 1: 脚手架 + `bun test packages/feature-context-menu/tests/installContextMenuFeature.test.ts`（先红）**

- [ ] **Step 2: `git mv` layer + style + layer 测试**

- [ ] **Step 3: 实现 `defaultMenuProviders.ts`**

| Provider id | order | getItems |
|---|---:|---|
| `cell-default` | 10 | `getCellContextMenuItems`（`targetKind==='cell'` 时） |
| `column-default` | 20 | `getColumnHeaderContextMenuItems(ctx, pipeline)` |
| `row-default` | 30 | `getRowHeaderContextMenuItems` |

`handleAction`：cell 的 cut/copy/paste 在未设置 `onContextMenuAction` 时调 deps `clipboard*`；列/行动作 **不** 在 provider 处理（controller 内保留与现 runtime 相同的 dispatch 表）。

- [ ] **Step 4: `ContextMenuController`**

从 `WebGridRuntime.ts:844-1037` **搬移**（非重写）：

- `handleHostContextMenu` — 列头/行头/单元格命中、选区更新、`mergeMenuItems` 打开 layer
- `handleAction` — 三分支 dispatch
- `lastContextMenuContext` / `lastContextMenuPoint` 状态放在 controller 内
- `attach`/`destroy`/`applyTheme`/`close`/`isOpen` 委托 layer

`installContextMenuFeature`:

```ts
export function installContextMenuFeature(ctx: SheetContext): void {
  registerDefaultMenuProviders(ctx) // 三个 registerWebMenuItem
  registerWebContextMenu(ctx, {
    id: 'context-menu',
    order: 10,
    create: (deps) => new ContextMenuController(deps),
  })
}
```

- [ ] **Step 5: runtime `createWebContextMenuDeps()` 接线；backend 删 layer；sheet 安装**

- [ ] **Step 6: 迁移测试**

| 原路径 | 新路径 |
|---|---|
| `web/tests/interaction/DomContextMenuLayer.test.ts` | `feature-context-menu/tests/...` |
| `web/tests/runtime/WebGridRuntime.test.ts` 中 `describe('WebGridRuntime contextmenu')` | `feature-context-menu/tests/WebGridRuntime.context-menu.test.ts`（`installContextMenuFeature` + 真实 controller） |
| `feature-editing/.../editing.test.ts` mock menu | 改为 `installContextMenuFeature(ctx)` 或继续 mock `WebContextMenu` |

- [ ] **Step 7: 全量 gates + commit**

```bash
bun run lint
bun run --filter '*' typecheck
bun test
bun run --filter @novasheet/sheet build && bun run --filter @novasheet/web build && bun run --filter @novasheet/feature-context-menu build && bun run --filter @novasheet/core build
```

```bash
git commit -m "$(cat <<'EOF'
feat(feature-context-menu): 右键菜单整竖切片拆包并建立 menu 契约

EOF
)"
```

---

## Task 4: 文档与总路线图打勾

**Files:**

- Modify: `docs/architecture.md` — Feature Packages 段增加 `feature-context-menu`、`web.menu-item`、`web.context-menu`
- Modify: `docs/superpowers/plans/2026-06-02-novasheet-feature-package-roadmap.md` — phase 6 → `[x]`，当前执行焦点改 phase 7
- Modify: `CLAUDE.md` — Last shipped 一行（若本仓库惯例要求）

- [ ] **Step 1: 更新 architecture + roadmap**

- [ ] **Step 2: commit**

```bash
git commit -m "$(cat <<'EOF'
docs(plan): phase 6 右键菜单 feature 拆包完成

EOF
)"
```

---

## Task 5（可选 follow-up，不阻塞 phase 6 打勾）: 剪贴板 menu-item 与键盘入口

**目的：** 兑现路线图「clipboard 菜单入口回收」；禁用 clipboard feature 时 cell 菜单不展示 cut/copy/paste 或全部 disabled。

- `feature-clipboard` 注册 `web.menu-item` provider（`order: 15`），`getItems` 仅在 `clipboardController` 可用时启用（通过 deps 注入探测或拆到 controller deps）。
- 从 `defaultMenuProviders` 移除 cell-default 或改为 feature-context-menu 仅在 clipboard 未注册时 fallback。

**键盘：** 新建 `web.keyboard` 或让 context-menu feature 导出 `registerClipboardShortcuts` — **须单独 brainstorm**，不并入 Task 3 原子提交。

---

## Verification Checklist（打勾规则）

- [ ] 单项计划 Task 1–4 完成
- [ ] 默认 sheet：`packages/sheet/tests/Grid.col-menu.test.ts` 等仍绿
- [ ] 未安装 `installContextMenuFeature` 时 `handleHostContextMenu` no-op（Task 2 测试）
- [ ] lint / typecheck / test / build 全绿
- [ ] `docs/architecture.md` 已更新
- [ ] 工作区干净，phase 6 有独立 `feat(feature-context-menu):` 提交（Task 1–3 可按计划拆 3 commit，与 phase 3–5 一致）

---

## 与已完成 phase 的对照

| 维度 | fill (3) | clipboard (5) | context-menu (6) |
|---|---|---|---|
| 新贡献点 | `WebFrameSync`（能力探测） | `web.clipboard` | `web.menu-item` + `web.context-menu` |
| DOM | feature 自持 layer | 无 DOM | feature 自持 `DomContextMenuLayer` |
| 语义 | core engine | core engine | core `ContextMenuModel` + runtime deps 动作 |
| kernel 债务 | `onFill` | 键盘+菜单入口+4 回调 | 键盘+FilterPopover+sort 动作仍在 runtime |

Phase 6 完成后，phase 7 `sort-filter` 可只新增 `web.menu-item` provider + 收窄 runtime 列头 dispatch，而不动 layer。
