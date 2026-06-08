# @novasheet/mbd — Markdown 行为场景工具包 — 设计

- **日期**：2026-06-09
- **状态**：设计（待评审）
- **分支**：`refactor-default-grid-engine-decomposition`
- **范围决策**：**A — 仅 monorepo 内部工具**（`private: true`，不发布 npm）
- **前置**：[`2026-06-08-novasheet-behavioral-testing-design.md`](./2026-06-08-novasheet-behavioral-testing-design.md) Phase 0（excel-first）
- **首期消费者**：`@novasheet/react` — `packages/react/tests/excel/scenarios/*.md`

---

## 1. 背景与目标

Phase 0 在 `NovaExcel` 层用大行为测试定型产品契约。场景用 **Markdown** 描述（人读），测试用 **`bun:test` 的 `it` title** 追溯（机读）。

**本包 `@novasheet/mbd`**（markdown behavior-driven）**仅负责**：

1. 解析、校验 `scenarios/*.md`（`validate`）
2. 导出 **`scenarios.manifest.json` + `SCENARIOS.md`**（`manifest`，跨语言场景大清单）

**不在 mbd 包内**：

- **场景结构覆盖率** — 各消费者测试工具读 manifest 自算（React：`lint:scenario-coverage`）
- **测试代码生成** — 手写 `it('excel.L3x…')`，mbd **不提供 `codegen`**

不跑 `bun test`、不替代 Core TDD、不执行 Given/When/Then 正文。

---

## 2. 非目标

1. **不发布 npm** — `private: true`，仅 NovaSheet monorepo 内使用
2. **不依赖** `@novasheet/core` / `react` / `canvas2d`
3. **不实现** Gherkin/Cucumber step definitions
4. **不解析** MD 正文做自动断言（Given/When/Then 仅供人读与 CR）
5. **不替代** `bun test` — 行为对错仍由测试体断言
6. **Phase 0 不建** `packages/acceptance` 引擎 runner（见行为测试终态规格）
7. **不实现场景覆盖率 CLI** — 算法见 §7 契约，由消费者测试工具读 manifest 自行计算
8. **不生成测试代码** — 无 `codegen` / `it.todo` 骨架；测试由消费者手写

---

## 3. 设计原则

1. **id / layer / summary 以 frontmatter 为机读真相**；正文（User Story、G/W/T）仅轻量提取进 manifest，不参与覆盖率对账
2. **`summary` 对开发、`## User Story` 对用户** — 后者可选、放正文（可长文），提取进 manifest 展示，不进覆盖率算法
3. **场景 ID 精确匹配** — `it` / `it.todo` title 必须以 `id` 开头
4. **清单与覆盖率分离** — mbd 导出 manifest；覆盖率由各端测试框架实现
5. **title 契约写入 manifest** — `titleConvention` 供跨语言扫描，无需各端解析 MD
6. **YAGNI** — 首期两命令：`validate`、`manifest`

---

## 4. 包形态

```text
packages/mbd/
  package.json          # name: @novasheet/mbd, private: true
  src/
    index.ts            # 程序化 API re-export
    types.ts            # Scenario, ScenarioManifest, MbdConfig
    parse/
      markdown.ts       # glob MD + 解析 frontmatter
      validate.ts       # id / layer / 必填字段校验
    export/
      manifest-json.ts  # 导出 scenarios.manifest.json
      manifest-md.ts  # 导出 SCENARIOS.md 大清单
    cli.ts              # mbd 子命令入口
  tests/
    parse/
    export/
  README.md
```

**依赖**：仅 Node/Bun 内置 + 轻量 YAML frontmatter 解析（`Bun.YAML.parse` 或手写 `---` 分隔，避免重依赖）。

**不 build 产物对外发布**：CLI 经 `bun packages/mbd/src/cli.ts` 或 `package.json` `"bin"` 指向 ts 入口（与现有 `scripts/check-*.ts` 风格一致）。

---

## 5. MD 场景文件格式

### 5.1 目录约定（首期消费者）

```text
packages/react/tests/excel/scenarios/
  L3a-default-mount.md
  L3b-undo-redo.md
  ...
```

文件名 **建议** 与 slug 一致；**权威关联** 以 frontmatter `id` 为准。

### 5.2 单文件结构

一个场景文件分 **两层**：

| 区块 | 位置 | 读者 | 机读 |
| --- | --- | --- | --- |
| **Frontmatter** | `---` 围栏内 | 开发、mbd、覆盖率工具 | ✅ `validate` / `manifest` 解析 |
| **正文** | `##` 标题分段 | 产品（User Story）、开发（G/W/T） | 轻量提取进 manifest；**不参与**覆盖率与 `it` 匹配 |

```text
┌─ frontmatter（机读真相，宜短）────────────────────────┐
│  id / layer / summary     ← 必填，开发向              │
│  tags / status            ← 可选                      │
└───────────────────────────────────────────────────────┘
┌─ 正文（人读 + 轻量提取，可长文）──────────────────────┐
│  ## User Story  ← 可选，用户向（见 §5.5）；可多段     │
│  ## Given       — 前置条件（技术可观测）              │
│  ## When        — 用户操作或触发事件                  │
│  ## Then        — 可断言结果（开发语言）              │
└───────────────────────────────────────────────────────┘
```

**完整示例**（含可选 `## User Story`，可写长文）：

```markdown
---
id: excel.L3b.undo-redo
layer: L3b
tags: [toolbar, undo]
summary: toolbar 点 undo 调用 grid.undo
status: draft
---

## User Story

作为表格用户，当我误改了单元格内容或套用了错误格式时，我想点击工具栏撤销按钮一步步回退，以便恢复上一步状态，而不必手动逐项改回。

撤销后，工具栏按钮的可用状态也应与当前能否继续撤销/重做保持一致，避免我以为还能撤销却按钮已灰掉。

## Given
- NovaExcel 已挂载，dense data

## When
- 点击 `[data-action-id="undo"]`

## Then
- `grid.undo` 被调用
- `onToolbarAction({ id: 'undo' })` 触发
```

**最小示例**（L3a 壳层可省略 `## User Story`）：

```markdown
---
id: excel.L3a.default-mount
layer: L3a
summary: 默认挂载 excel/grid/toolbar/canvas
status: draft
---

## Given
- 渲染 `<NovaExcel data={denseFixture} />`

## When
- 挂载完成

## Then
- 存在 `data-novasheet-react-excel`、grid、toolbar、canvas
```

> **分工提醒**：`## User Story` 写用户价值（可长、可分段）；`summary` + G/W/T 写技术契约。勿在 User Story 里写 `grid.undo` 等实现细节，也勿用 G/W/T 复述用户故事——两层互补，不重复。

### 5.3 Frontmatter 字段

| 字段 | 必填 | 约束 |
| --- | --- | --- |
| `id` | 是 | 正则 `^excel\.L3[abc]\.[a-z0-9-]+$`（首期）；可配置 `idPattern` |
| `layer` | 是 | `L3a` \| `L3b` \| `L3c` |
| `summary` | 是 | 非空字符串；**开发向**一句话；建议作为测试 `it` title 的人类可读后缀 |
| `tags` | 否 | 字符串数组 |
| `status` | 否 | `draft` \| `implemented`；供实现覆盖率（Phase 1） |

### 5.5 用户故事（`## User Story`，可选）

放在 **正文**，不用 frontmatter——用户故事可能很长、多段，YAML 围栏不适合承载。

| 维度 | `summary`（frontmatter） | `## User Story`（正文） |
| --- | --- | --- |
| 读者 | 开发、测试、CR | 产品、设计、最终用户文档 |
| 语气 | 技术可观测（如「调用 `grid.undo`」） | 用户价值（如「恢复误改」） |
| 长度 | 一句话 | **可长文、多段、列表** |
| 必填 | 是 | **否** — 复杂场景、对外文档、旅程类（L3c）建议写 |
| 机读用途 | `it` title 后缀、清单摘要 | manifest / `SCENARIOS.md` 展示；**永不**参与字符串匹配 |

**标题**：canonical `## User Story`；别名 `## 用户故事`（提取时等价）。

**内容**：标题下至下一个 `##` 之前的全部 Markdown 原文（段落、列表均可）；`mbd manifest` 去首尾空白后写入 `scenarios[].userStory` 单字符串，段间保留 `\n\n`。节为空则省略 manifest 字段。

**推荐句式**（不强制，自由撰写）：

```text
作为 <角色>，当 <情境> 时，我想 <操作/能力>，以便 <价值/结果>。
```

壳层契约（L3a）等技术向场景可省略整节；用户旅程（L3c）建议补齐。

**建议顺序**：`## User Story`（若有）→ `## Given` → `## When` → `## Then`。

### 5.6 正文

| 节 | 必填 | 提取规则 |
| --- | --- | --- |
| `## User Story` / `## 用户故事` | 否 | 标题下至下一 `##` 的原文 → `userStory` 字符串 |
| `## Given` / `## When` / `## Then` | 建议 | `- ` 列表项 → `given` / `when` / `then` 数组 |

正文 **永不** 参与覆盖率字符串比对。

---

## 6. 测试 title 约定

消费者测试文件中，每个场景至少一个：

```ts
it('excel.L3b.undo-redo dispatches grid.undo', () => { ... })
it.todo('excel.L3a.strict-mode-remount second mount keeps ref')
```

| 规则 | 说明 |
| --- | --- |
| title **以 `id` 开头** | 后跟空格 + 人类可读说明 |
| 允许多个 `it` 同一 `id` | 罕见；计入 covered |
| `it.todo` / `it.skip` | 计入 **结构覆盖**；默认不计入 **实现覆盖** |
| 扫描范围 | 配置 `tests` glob；默认不含 `node_modules` |

### 6.1 扫描正则（bun:test）

从源码匹配：

```text
\bit(?:\.todo|\.skip)?\(\s*['"](excel\.L3[abc]\.[a-z0-9-]+)
```

提取 capture group 1 为 `foundId`。

---

## 7. 场景覆盖率契约（消费者实现，mbd 不算）

mbd 只产出 **`scenarios.manifest.json`**；结构覆盖率由**各消费者测试工具**读取 manifest 并扫描本语言测试文件。

### 7.1 推荐算法

```text
expectedIds ← manifest.scenarios.map(s => s.id)
foundIds    ← 消费者扫描器（见 §6.1 正则或语言等价物）

covered = expectedIds ∩ foundIds
missing = expectedIds - foundIds
orphan  = foundIds - expectedIds    # 可选 warn

structuralRate = |covered| / |expectedIds|
```

按 `manifest.scenarios[].layer` 分组统计。

### 7.2 NovaSheet 首期实现（`@novasheet/react`）

| 项 | 路径 |
| --- | --- |
| 脚本 | `packages/react/scripts/check-scenario-coverage.ts` |
| 输入 | `scenarios.manifest.json` + `tests/excel/**/*.test.ts` |
| 命令 | `bun run --filter @novasheet/react lint:scenario-coverage` |
| CI | 可选 `--fail-on-missing`；与 `bun run lint` 并列，**不在 mbd 包** |

### 7.3 实现覆盖率（可选，消费者自决）

| `it` 形态 | 结构覆盖 | 实现覆盖 |
| --- | --- | --- |
| `it('id …', () => { ... })` 非空、非 `throw` 壳 | ✅ | ✅ |
| `it.todo('id …')` | ✅ | ❌ |
| `it.skip('id …')` | ✅ | ❌ |

实现覆盖率是否进 CI 由各消费者决定；mbd 不参与。

---

## 8. CLI

```bash
# 校验 MD（无测试扫描）
bun run --filter @novasheet/mbd mbd validate

# 从 MD 导出跨语言场景大清单（JSON + Markdown）
bun run --filter @novasheet/mbd mbd manifest

```

根目录快捷方式（实现期）：

```bash
bun run sync:mbd-manifest     # → mbd manifest
```

场景结构覆盖率（React，非 mbd）：

```bash
bun run --filter @novasheet/react lint:scenario-coverage
```

### 8.1 退出码

| 命令 | exit 0 | exit 1 |
| --- | --- | --- |
| `validate` | 所有 MD frontmatter 合法、id 无重复 | 校验失败 |
| `manifest` | 写入成功 | 校验失败或 IO 错误 |

### 8.2 `manifest` 命令 — 跨语言场景大清单

**目的**：把 `scenarios/*.md` 聚合成 **一份稳定、机器可读的权威清单**，供 Vue / Flutter / 其他语言 **复制或读取** 后，用同一套 `id` 规则做场景结构覆盖率，而无需各自解析 Markdown。

```bash
# 默认：同时写 JSON + Markdown
bun run --filter @novasheet/mbd mbd manifest

# 仅 JSON（CI / 其他语言消费）
bun run --filter @novasheet/mbd mbd manifest --format json

# 仅 Markdown（人读大表）
bun run --filter @novasheet/mbd mbd manifest --format md
```

**默认输出路径**（`mbd.config.ts` 可配）：

```text
packages/react/tests/excel/scenarios.manifest.json   # 机读，跨语言主产物
packages/react/tests/excel/SCENARIOS.md              # 人读大清单
```

文件头标注 `@generated by @novasheet/mbd`；**勿手改**，改 MD 后重跑 `mbd manifest`。

#### 8.2.1 `scenarios.manifest.json` 形状

```json
{
  "version": 1,
  "generatedAt": "2026-06-09T12:00:00.000Z",
  "source": "packages/react/tests/excel/scenarios/**/*.md",
  "titleConvention": {
    "description": "测试用例名称必须以 scenario id 开头，后接空格与人类可读说明",
    "idPattern": "^excel\\.L3[abc]\\.[a-z0-9-]+$",
    "examples": [
      "excel.L3b.undo-redo dispatches grid.undo",
      "test('excel.L3b.undo-redo', ...)"
    ]
  },
  "scenarios": [
    {
      "id": "excel.L3b.undo-redo",
      "layer": "L3b",
      "summary": "toolbar 点 undo 调用 grid.undo",
      "userStory": "作为表格用户，当我误改了单元格内容或套用了错误格式时，我想点击工具栏撤销按钮一步步回退，以便恢复上一步状态，而不必手动逐项改回。\n\n撤销后，工具栏按钮的可用状态也应与当前能否继续撤销/重做保持一致，避免我以为还能撤销却按钮已灰掉。",
      "tags": ["toolbar", "undo"],
      "status": "draft",
      "sourceFile": "packages/react/tests/excel/scenarios/L3b-undo-redo.md",
      "given": ["NovaExcel 已挂载，dense data"],
      "when": ["点击 `[data-action-id=\"undo\"]`"],
      "then": ["`grid.undo` 被调用", "`onToolbarAction({ id: 'undo' })` 触发"]
    }
  ]
}
```

| 字段 | 说明 |
| --- | --- |
| `version` | manifest  schema 版本；破坏性变更时递增 |
| `titleConvention` | 跨语言测试命名契约，写入清单避免口头传递 |
| `scenarios[].userStory` | 可选；来自正文 `## User Story`（或 `## 用户故事`）；无节或空则省略该键 |
| `scenarios[].given/when/then` | 从 MD 正文 `## Given/When/Then` 下提取列表项（`- ` 行）；提取失败则为 `[]` |
| `scenarios[].sourceFile` | 相对 monorepo 根路径，追溯用 |

#### 8.2.2 `SCENARIOS.md` 形状（人读大清单）

```markdown
# NovaExcel 行为场景清单

> @generated by @novasheet/mbd — 改 scenarios/*.md 后执行 `bun run sync:mbd-manifest`

| id | layer | status | summary |
| --- | --- | --- | --- |
| excel.L3a.default-mount | L3a | implemented | 默认挂载 … |

## excel.L3b.undo-redo

- **layer**: L3b
- **summary**: toolbar 点 undo 调用 grid.undo

### User Story

作为表格用户，当我误改了单元格内容或套用了错误格式时，我想点击工具栏撤销按钮一步步回退……

（manifest 导出时保留原文段落）

### Given
…

### When
…

### Then
…
```

#### 8.2.3 跨语言场景覆盖率（消费契约）

其他语言 **不解析 MD、不依赖 mbd CLI**，只读 `scenarios.manifest.json` 并按 `titleConvention` 扫描测试名（算法 §7.1）。

| 语言 | 覆盖率工具归属 | title 示例 |
| --- | --- | --- |
| React / bun:test | `packages/react/scripts/check-scenario-coverage.ts` | `it('excel.L3x…')` |
| Vue / Vitest | 未来 `packages/vue` 自研 | 同规则 |
| Flutter / Dart | 未来 Dart 脚本 | `test('excel.L3x…', …)` |

清单提交进 git；跨仓可复制 JSON。

#### 8.2.4 命令关系

```text
scenarios/*.md
    ├─ mbd validate   →  MD 合法？
    └─ mbd manifest   →  scenarios.manifest.json + SCENARIOS.md

scenarios.manifest.json
    ├─ react 手写 tests/excel/*.test.ts
    └─ react lint:scenario-coverage  →  结构覆盖率
```

**推荐顺序**：`validate` → `manifest` → 提交清单 → 手写 `it` → `lint:scenario-coverage` → `bun test`。

---

## 9. 配置

默认读取 monorepo 根 `mbd.config.ts`；消费者可 `--config` 覆盖。

```ts
import type { MbdConfig } from '@novasheet/mbd'

const config: MbdConfig = {
  scenarios: 'packages/react/tests/excel/scenarios/**/*.md',
  tests: ['packages/react/tests/excel/**/*.test.ts'],
  idPattern: /^excel\.L3[abc]\.[a-z0-9-]+$/,
  manifest: {
    json: 'packages/react/tests/excel/scenarios.manifest.json',
    markdown: 'packages/react/tests/excel/SCENARIOS.md',
  },
}

export default config
```

场景覆盖率配置在 **消费者**（如 `packages/react/mbd.consumer.config.ts`）中，不在 mbd 包。

---

## 10. 程序化 API（供测试与脚本）

```ts
export interface Scenario {
  readonly id: string
  readonly layer: string
  readonly summary: string
  readonly userStory?: string
  readonly tags: readonly string[]
  readonly status?: 'draft' | 'implemented'
  readonly filePath: string
}

export function parseScenarios(glob: string): Scenario[]

export interface ScenarioManifest {
  readonly version: number
  readonly generatedAt: string
  readonly source: string
  readonly titleConvention: {
    readonly description: string
    readonly idPattern: string
    readonly examples: readonly string[]
  }
  readonly scenarios: readonly ScenarioEntry[]
}

export interface ScenarioEntry extends Scenario {
  readonly given: readonly string[]
  readonly when: readonly string[]
  readonly then: readonly string[]
}

export function buildManifest(scenarios: ScenarioEntry[], config: MbdConfig): ScenarioManifest
export function writeManifestJson(manifest: ScenarioManifest, outPath: string): void
export function writeManifestMarkdown(manifest: ScenarioManifest, outPath: string): void
export function readManifest(jsonPath: string): ScenarioManifest
```

`packages/mbd/tests/` 对以上 API **TDD 驱动**实现。

---

## 11. 与 `@novasheet/react` 集成

```text
packages/react/tests/excel/
  scenarios/*.md              ← 人编辑场景（唯一真相）
  scenarios.manifest.json     ← mbd manifest 生成（跨语言机读）
  SCENARIOS.md                ← mbd manifest 生成（人读大清单）
  NovaExcel.test.ts           ← 手写测试（title 带场景 id）
  NovaExcel.wiring.test.ts    ← 手写 L3b（实现期，可选拆分）
```

| 角色 | 包 |
| --- | --- |
| 场景作者 | 编辑 `scenarios/*.md` |
| 大清单导出 | `@novasheet/mbd manifest` |
| 测试实现 | 手写 `tests/excel/*.test.ts` |
| 场景结构覆盖率 | `lint:scenario-coverage` |
| 行为断言 | `bun test packages/react` |

`packages/react/docs/project-standards.md` 引用本规格与 `mbd.config.ts`。

---

## 12. CI 门禁

```text
bun run sync:mbd-manifest                    # mbd manifest
bun run --filter @novasheet/react lint:scenario-coverage   # react 读 manifest
bun test
```

| 门禁 | Phase 0 是否阻断 PR |
| --- | --- |
| `mbd validate` | 是（MD 损坏/id 重复） |
| `mbd manifest` 产物已提交 | 是（改 MD 未 regen manifest → CI diff 失败，实现期） |
| `react lint:scenario-coverage` | **可选渐进**：初期限 missing 仅 warn |
| `bun test` | 是 |

---

## 13. 与行为测试终态规格的关系

| 文档 / 包 | 关系 |
| --- | --- |
| `2026-06-08-novasheet-behavioral-testing-design.md` | 终态 L0–L4；Phase 0 用 **mbd 替代** 文中 YAML L0 设想 |
| 附录 C 表格 | **迁移** 为 `scenarios/*.md`；附录改为链接 |
| 未来 `packages/acceptance` | 可 `import { parseScenarios } from '@novasheet/mbd'` 再导出 YAML |

```text
Phase 0:  mbd (MD → manifest) + react (覆盖率 + excel 测试)
Phase 2:  acceptance (L2 Grid runner) + mbd 复用 parse/export
```

---

## 14. 附录 C → MD 迁移清单（21 条）

实现 `scenarios/` 时按此表建文件（`id` = frontmatter）。

### L3a（6）

| id | summary |
| --- | --- |
| `excel.L3a.default-mount` | 默认挂载 excel/grid/toolbar/canvas |
| `excel.L3a.no-toolbar` | showToolbar false 隐藏 toolbar |
| `excel.L3a.sparse-default` | 无 data 时使用 SparseExcelDataSource |
| `excel.L3a.ref-exposes-grid` | ref 暴露 grid 与 scrollToCell |
| `excel.L3a.strict-mode-remount` | Strict Mode 双挂载 |
| `excel.L3a.props-callbacks` | onSelectionChange 等回调 |

### L3b（10）

| id | summary |
| --- | --- |
| `excel.L3b.undo-redo` | undo/redo 接线 |
| `excel.L3b.clipboard` | copy/cut/paste 接线 |
| `excel.L3b.fill-color` | setFillColor 接线 |
| `excel.L3b.borders` | setBorders 接线 |
| `excel.L3b.merge-cells` | mergeCells 接线 |
| `excel.L3b.unmerge-cells` | unmergeCells 接线 |
| `excel.L3b.text-wrap` | setTextWrap 循环接线 |
| `excel.L3b.default-range-on-format` | 无选区时默认选区后 format |
| `excel.L3b.undo-disabled` | canUndo false 时 undo disabled |
| `excel.L3b.selection-sync` | 选区变化同步 toolbar state |

### L3c（5）

| id | summary |
| --- | --- |
| `excel.L3c.fill-reflects-toolbar` | 填色后 toolbar 反映 |
| `excel.L3c.undo-button-state` | undo 按钮启用/禁用 |
| `excel.L3c.no-toolbar-grid-ref` | 无 toolbar 时 ref 仍可用 |
| `excel.L3c.sparse-ref-grid` | 稀疏默认工作区 ref.grid |
| `excel.L3c.external-on-undo-on-redo` | onUndo/onRedo 与 toolbar 联动 |

---

## 15. ADR

### ADR-A：独立包 vs react/scripts

**决策**：独立 `packages/mbd`（private）。边界清晰、可单测、未来 Vue 仓可复制包目录。

### ADR-B：MD vs YAML 场景源

**决策**：Phase 0 作者格式 **MD + frontmatter**；YAML 导出留待 `acceptance` 阶段。

### ADR-C：结构覆盖率 vs 实现覆盖率

**决策**：结构覆盖率由各消费者测试工具实现；实现覆盖率报告不阻断 Phase 0 PR。

### ADR-D：monorepo 内部 vs 发布

**决策**：**A — private only**；不维护 npm 文档与 semver；API 变更随 monorepo 同步。

### ADR-E：mbd 不算场景覆盖率

| 方案 | 优点 | 缺点 |
| --- | --- | --- |
| **mbd 内置 `coverage` CLI**（否决） | 一条命令 | 与 bun/Vitest/Flutter 工具重复；mbd 变胖 |
| **manifest + 消费者脚本**（采纳） | 职责清晰；跨语言各用本族扫描器 | react 需维护 `check-scenario-coverage.ts` |

**决策**：mbd 只导出 manifest；**去掉 `coverage` 命令**；首期由 `@novasheet/react` 的 `lint:scenario-coverage` 读 manifest 算结构覆盖率。

### ADR-F：mbd 不 codegen 测试骨架

| 方案 | 优点 | 缺点 |
| --- | --- | --- |
| **mbd codegen `it.todo`**（否决） | 结构覆盖率快速 100% | 生成文件与手写测试双轨；消费者仍要填实现 |
| **手写 `it` + manifest 对账**（采纳） | 测试代码单一来源；mbd 极薄 | 新场景须人工加 `it` |

**决策**：mbd **仅 `validate` + `manifest`**；测试由消费者按 `titleConvention` 手写。

---

## 16. 实现计划入口

评审通过后撰写：  
`docs/superpowers/plans/2026-06-09-novasheet-mbd-package.md`

任务概要：

1. 创建 `packages/mbd` + TDD 单测
2. `parse` / `validate` / `manifest` CLI（JSON + SCENARIOS.md）
3. 根 `mbd.config.ts` + `sync:mbd-manifest`
4. 迁移 21 个 `scenarios/*.md` + 首版 manifest 产物入 git
5. 现有 5 条 `it` 改 `excel.L3a.*` id 前缀；逐条手写补全测试
6. `packages/react/scripts/check-scenario-coverage.ts` + `lint:scenario-coverage`
