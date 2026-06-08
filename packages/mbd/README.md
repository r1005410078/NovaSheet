# @novasheet/mbd

Markdown 行为场景工具（**monorepo 内部**，`private: true`）。

**只做两件事**：校验场景 MD、导出跨语言场景大清单。  
测试代码与场景覆盖率由消费者自行维护（React：`bun test` + `lint:scenario-coverage`）。

场景 MD 除 `summary`（开发向、frontmatter）外，正文可写可选 **`## User Story`**（用户向、可长文，导出进 `SCENARIOS.md`，不参与测试匹配）。

| 文档 | 用途 |
| --- | --- |
| [设计规格](../../docs/superpowers/specs/2026-06-09-novasheet-mbd-package-design.md) | API、MD 格式、CLI、ADR |
| [行为测试终态 Phase 0](../../docs/superpowers/specs/2026-06-08-novasheet-behavioral-testing-design.md) | 与 Core TDD / excel 分工 |
| [react 测试规范](../react/docs/project-standards.md) | 手写 `it` title、场景覆盖率 |

---

## 一张图：分工

```text
┌─────────────────────────────────────────────────────────────┐
│  mbd（本包）     validate + manifest                          │
│                  MD → scenarios.manifest.json + SCENARIOS.md  │
├─────────────────────────────────────────────────────────────┤
│  @novasheet/react                                           │
│    手写 tests/excel/*.test.ts（it title = 场景 id）          │
│    lint:scenario-coverage（读 manifest 算结构覆盖率）          │
│    bun test（行为断言）                                      │
├─────────────────────────────────────────────────────────────┤
│  @novasheet/core     TDD 单测（持续）                         │
└─────────────────────────────────────────────────────────────┘
```

---

## 数据流

```text
scenarios/*.md
    │  mbd validate
    │  mbd manifest
    ▼
scenarios.manifest.json + SCENARIOS.md
    │
    ├─► Vue / Flutter … 复制 JSON，自研覆盖率工具
    │
    └─► react: 手写 it + lint:scenario-coverage + bun test
```

---

## 实现路径

### 阶段 1 — mbd 最小集

| 步 | 交付 |
| --- | --- |
| 1.1 | `packages/mbd`：`parse/`、`validate/`、`export/` |
| 1.2 | CLI：`validate`、`manifest`；根 `sync:mbd-manifest` |
| 1.3 | 迁移 21 个 `scenarios/*.md` |

**出口**：`bun run sync:mbd-manifest`

### 阶段 2 — React 消费者

| 步 | 包 | 交付 |
| --- | --- | --- |
| 2.1 | react | `scripts/check-scenario-coverage.ts` + `lint:scenario-coverage` |
| 2.2 | react | 手写 / 扩展 `tests/excel/*.test.ts`，`it('excel.L3x…')` |
| 2.3 | react | `bun test` 行为断言 |

---

## 场景 MD 字段速览

| 区块 | 必填 | 读者 |
| --- | --- | --- |
| frontmatter：`id` / `layer` / `summary` | 是 | 开发、测试、清单 |
| 正文：`## User Story` | **否** | 产品、设计、用户文档（可长文） |
| 正文：`## Given/When/Then` | 建议 | CR、实现参考 |

```markdown
## User Story

作为表格用户，当我误改了内容时，我想点击工具栏撤销按钮，以便恢复上一步状态。
（可写多段，不必挤在 frontmatter 里）
```

---

## 日常开发

```text
1. 改 scenarios/*.md
2. mbd validate
3. mbd manifest     → 提交 manifest.json + SCENARIOS.md
4. 手写 tests/excel/*.test.ts（title 以场景 id 开头）
5. lint:scenario-coverage
6. bun test
```

```ts
it('excel.L3b.undo-redo dispatches grid.undo', () => { ... })
```

---

## CLI（仅两条）

```bash
bun run --filter @novasheet/mbd mbd validate
bun run --filter @novasheet/mbd mbd manifest
bun run sync:mbd-manifest    # 根目录快捷
```

---

## 本包不做什么

| 不是 | 去哪 |
| --- | --- |
| 生成测试代码 / `it.todo` 骨架 | 手写 `tests/excel/*.test.ts` |
| 场景结构覆盖率 | react `lint:scenario-coverage` |
| 跑测试 | `bun test` |
| 发布 npm | monorepo 内部 |

---

**阶段 1 状态**：`parse` / `validate` / `manifest` CLI 已实现；21 个 `scenarios/*.md` + manifest 产物已生成。  
**阶段 2 状态**：`lint:scenario-coverage` + 21 条 `excel.L3x.*` 行为测试已落地（见 react `project-standards.md`）。
