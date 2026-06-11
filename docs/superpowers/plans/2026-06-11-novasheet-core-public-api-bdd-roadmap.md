# NovaSheet Core Public API BDD Roadmap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 分批建立 Core L0–L2 BDD 契约，最终让 `@novasheet/core` 所有公开、可观测、行为承载 API 都有场景覆盖路径。

**Architecture:** 在 `packages/core` 内建立 Core BDD 契约：L0/L1/L2 场景统一写成 MBD Markdown（frontmatter + `## User Story` + Given/When/Then），由 `@novasheet/mbd` validate/manifest；测试仍是手写 `bun:test`，`it()` 标题以 scenario id 开头。每批先写场景与失败行为测试，再补最小公开 API 调用与必要观测 API。

**Tech Stack:** Bun workspaces、`bun:test`、TypeScript strict、`@novasheet/core`、`@novasheet/mbd`、Happy DOM（仅 L2 `Grid` facade 场景需要 DOM）。

---

## 1. 范围决策

| 类别 | BDD 覆盖方式 | 不变量 |
| --- | --- | --- |
| `Grid` 门面方法 | L2 必测；能映射到 engine 的场景可同时写 L1/L2 断言 | 禁止 `delegate.engine` 穿透 |
| `DefaultGridEngine` 公开行为 | L1 必测；必要时与 L2 结果对齐 | mutation 仍经 engine/domain seam |
| `DataSource` / `MutableDataSource` | L0 直接 datasource scenario | `getRows(start,end)` 的 `end` 仍为 inclusive |
| view/format/merge/undo/clipboard/fill | L1/L2 行为断言 | 断言公开观测，不断言内部 store 结构 |
| public pure utilities | L0 technical scenario | 行为型输入输出覆盖，不替代细粒度 TDD |
| type-only exports | 不写运行时场景；由 typecheck / probe tests 覆盖 | 文档矩阵标记 `type-only` |
| L4 renderer / painter | 不纳入 Core BDD | `RecordingContext` 继续纯 TDD |

## 2. 目标文件结构

| 路径 | 职责 |
| --- | --- |
| `packages/core/mbd.config.ts` | Core BDD 场景配置；允许 `L0/L1/L2/type-only` layer |
| `packages/core/tests/acceptance/**/scenarios/**/*.md` | Core 场景；`id` 全局唯一；frontmatter `layer` 保留 L0/L1/L2，目录按行为域分层 |
| `packages/core/tests/acceptance/**/*.test.ts` | 手写 `bun:test` 行为测试；`it()` 标题以 scenario id 开头；按域拆文件 |
| `packages/core/tests/acceptance/_helpers/fixtures.ts` | 共享 Grid / DataSource 夹具（`mountRecordingGrid` 等） |
| `packages/core/tests/acceptance/scenarios.manifest.json` | `@novasheet/mbd` generated 机读清单 |
| `packages/core/tests/acceptance/SCENARIOS.md` | `@novasheet/mbd` generated 人读清单 |
| `packages/core/package.json` | `lint:mbd` / `manifest:mbd` scripts |
| `docs/superpowers/specs/2026-06-08-novasheet-behavioral-testing-design.md` | 已解除 Core L0–L2 暂缓 |

**场景目录映射（`layer` 不变，路径按 acceptance taxonomy）：**

| 域 | 场景目录 |
| --- | --- |
| DataSource / Workspace / Sort·Filter L0+L2 | `acceptance/functional/data-ops/scenarios/` |
| Engine L1 oracle | `acceptance/e2e/engine/scenarios/` |
| Grid 门面 L2 旅程 | `acceptance/e2e/grid/scenarios/` |
| 几何 / 主题 / 菜单不变量 L0 | `acceptance/properties/scenarios/` |
| TSV / paste 线性格式 L0 | `acceptance/contract/file-format/scenarios/` |
| 公开类型面 type-only | `acceptance/contract/plugin-api/scenarios/` |
| 事件订阅 L2 | `acceptance/contract/events/scenarios/` |
| 选区 / 导航 | `acceptance/interaction/selection/scenarios/` |
| 剪贴板 / 编辑 / 填充 | `acceptance/interaction/editing/scenarios/` |
| Undo 序列化 L0 | `acceptance/interaction/undo/scenarios/` |
| 公式 / 重算（占位） | `acceptance/functional/formula/`、`functional/recalculation/` |

## 3. Scenario 命名

| 层 | id 例子 | 含义 |
| --- | --- | --- |
| L0 | `core.L0.datasource-in-memory-read-cell` | public pure / datasource 输入输出契约 |
| L1 | `core.L1.engine-frame-initial-visible-range` | `DefaultGridEngine` headless 可观测行为 |
| L2 | `core.L2.grid-lifecycle-refresh-destroy` | `Grid` / DOM facade 行为 |
| Type-only | `core.type.schema-field` | 不执行；矩阵标记 typecheck/probe 覆盖 |

## 4. 分批路线

### Batch 0: Core BDD 骨架

**目标:** 能跑 3–5 条 smoke 场景，形成红绿闭环。

**覆盖 API:**
- `DefaultGridEngine.getFrame`
- `Grid.refresh`
- `Grid.destroy`
- `InMemoryDataSource.getCell`
- `formatValue`

**首批场景:**

| id | layer | APIs | Given / When / Then |
| --- | --- | --- | --- |
| `core.L1.engine-frame-initial-visible-range` | L1 | `DefaultGridEngine.getFrame` | dense 2x2 → getFrame → rows/cols/cells 可观测 |
| `core.L2.grid-lifecycle-refresh-destroy` | L2 | `Grid.refresh`, `Grid.destroy` | mount Grid → refresh/destroy/destroy → 不抛错 |
| `core.L0.datasource-in-memory-read-cell` | L0 | `InMemoryDataSource.getCell`, `getRows` | 2 行 schema → 读 cell/rows inclusive |
| `core.L0.format-value-number` | L0 | `formatValue` | number format → display string |

**验证:**
- `bun run --filter @novasheet/core lint:mbd`
- `bun run --filter @novasheet/core manifest:mbd`
- `bun test packages/core/tests/acceptance`
- `bun run --filter @novasheet/core typecheck`

### Batch 1: DataSource / Schema / Workspace

**目标:** 锁定数据层公开契约，作为后续场景 fixture 基线。

| id | layer | APIs |
| --- | --- | --- |
| `core.L0.datasource-in-memory-get-rows-inclusive` | L0 | `InMemoryDataSource.getRows` |
| `core.L0.datasource-in-memory-insert-delete-rows` | L0 | `insertRows`, `deleteRows`, `getRowCount` |
| `core.L0.datasource-in-memory-insert-delete-fields` | L0 | `insertFields`, `deleteFields`, `getSchema` |
| `core.L0.datasource-in-memory-move-fields` | L0 | `moveFields` |
| `core.L0.datasource-sparse-default-workspace` | L0 | `SparseExcelDataSource`, `SparseExcelWorkspaceSize` |
| `core.L0.workspace-autogrow-scroll-intent` | L0 | `ExcelWorkspaceController`, `decideExcelWorkspaceResize` |

### Batch 2: Grid Lifecycle / Layout / Events

**目标:** 覆盖 `Grid` facade 的生命周期、layout、scroll、event surface。

| id | layer | APIs |
| --- | --- | --- |
| `core.L2.grid-lifecycle-destroy-idempotent` | L2 | `destroy` |
| `core.L2.grid-data-theme-refresh` | L2 | `setData`, `setTheme`, `refresh` |
| `core.L2.grid-layout-row-column-size` | L2 | `setRowHeight`, `setColumnWidth`, `setRowHeights`, `setColumnWidths` |
| `core.L2.grid-frozen-config-frame` | L2 | `setFrozen`, `FrozenRegions` observable frame |
| `core.L2.grid-scroll-row-cell` | L2 | `scrollToRow`, `scrollToCell` |
| `core.L2.grid-events-on-off` | L2 | `on`, `onUndo`, `onRedo`, `onFill` |
| `core.L2.grid-autofit-wrap-rows` | L2 | `autofitRows`, `autofitRowHeights`, `wrapText` |

### Batch 3: Row / Column Structure

**目标:** 一次覆盖结构变更、回调、undo/redo、隐藏集合和 view 结果。

| id | layer | APIs |
| --- | --- | --- |
| `core.L2.grid-rows-insert-delete-undo-redo` | L2 | `insertRows`, `deleteRows`, `undo`, `redo`, `canUndo`, `canRedo` |
| `core.L2.grid-rows-hide-unhide-visible-count` | L2 | `hideRows`, `unhideRows`, `getHiddenRows`, render frame data |
| `core.L1.engine-rows-move-undo-redo` | L1 | `DefaultGridEngine.moveRows`, `undo`, `redo` |
| `core.L2.grid-cols-insert-delete-undo-redo` | L2 | `insertCols`, `deleteCols`, `undo`, `redo` |
| `core.L2.grid-cols-hide-unhide-visible-count` | L2 | `hideCols`, `unhideCols`, `getHiddenCols`, render frame schema |
| `core.L2.grid-cols-move-callback` | L2 | `moveCols`, `onColumnsMoved`, `undo`, `redo` |
| `core.L2.grid-header-menu-row-actions` | L2 | `getRowHeaderContextMenuItems`, `invokeRowHeaderContextMenuAction` |
| `core.L2.grid-header-menu-col-actions` | L2 | `getColumnHeaderContextMenuItems`, `invokeColumnHeaderContextMenuAction` |

### Batch 4: Selection / Navigation / Coordinates

**目标:** 锁定 view/raw 坐标转换、选区 remap、键盘导航和 reveal 计算。

| id | layer | APIs |
| --- | --- | --- |
| `core.grid.selection-set-get` | engine, grid | `setSelection`, `getSelection` |
| `core.grid.selection-remap-after-insert-delete` | engine, grid | structure + selection observation |
| `core.pure.selection-navigation-arrows` | pure | `parseSelectionNavigationKey`, `applySelectionNavigation` |
| `core.pure.coords-resolve-underlying-row` | pure | `findViewRow`, `resolveUnderlyingRow` |
| `core.pure.range-normalize-union-intersect` | pure | `normalizeRange`, `unionRange`, `rangesIntersect`, `isCellInRange` |
| `core.pure.scroll-reveal-cell` | pure | `computeScrollReveal` |
| `core.pure.cell-hit-test` | pure | `hitTestCell`, `computeCellRect` |

### Batch 5: Clipboard / Edit / Fill

**目标:** 覆盖 copy/cut/paste、编辑解析、填充柄 commit 的公开行为。

| id | layer | APIs |
| --- | --- | --- |
| `core.grid.clipboard.copy-cut-paste-roundtrip` | engine, grid | `copy`, `cut`, `paste`, `onCopy`, `onCut`, `onPaste` |
| `core.grid.clipboard.paste-skipped-readonly-type` | engine, grid | `onPasteSkipped`, `PasteSkippedCell` |
| `core.pure.clipboard.tsv-roundtrip` | pure | `serializeRowsToTsv`, `parseTsvToCells` |
| `core.pure.clipboard.paste-target-merge-conflict` | pure | `computePasteTarget`, `pasteTargetConflictsWithMerges`, `applyPaste` |
| `core.pure.edit-parse-format` | pure | `formatCellForEdit`, `parseCellEditInput`, `isTypableEditKey`, `isEditableFieldType` |
| `core.grid.fill-series-down-right` | engine, grid | `computeFillTarget`, `computeFillWrites`, `onFill` |
| `core.grid.fill-style-propagates` | engine, grid | fill + `getViewCellFormat` |

### Batch 6: Format / Merge / Value Format

**目标:** 锁定 view 坐标格式行为，尤其 sort/filter/结构变更下的 raw/view 不变量。

| id | layer | APIs |
| --- | --- | --- |
| `core.grid.format-fill-color-set-clear` | engine, grid | `setFillColor`, `getViewCellFormat` |
| `core.grid.format-borders-presets` | engine, grid | `setBorders`, `borderPatchForCell` |
| `core.grid.format-text-wrap-cycle` | engine, grid | `setTextWrap`, `TextWrapMode` |
| `core.grid.format-value-number-currency-date` | engine, grid | `setValueFormat`, `formatValue` |
| `core.grid.merge-unmerge-region` | engine, grid | `mergeCells`, `unmergeCells`, `getViewMergeRegion` |
| `core.grid.merge-format-survives-structure-undo` | engine, grid | format/merge + row/col insert/delete + undo/redo |
| `core.pure.theme-dense-grid-tokens` | pure | `denseGridTheme` public token shape |

### Batch 7: View Pipeline / Sort / Filter

**目标:** 用场景覆盖 view composition，避免 sort/filter/hide/structure drift。

| id | layer | APIs |
| --- | --- | --- |
| `core.grid.view-sort-ascending-descending` | engine, grid | `getSortLayer`, `SortLayer.setSpec`, `getViewPipeline` |
| `core.grid.view-filter-contains-equals` | engine, grid | `getFilterLayer`, `FilterLayer.setSpec`, `getViewPipeline` |
| `core.grid.view-hide-sort-filter-compose` | engine, grid | `HideRowsLayer`, `SortLayer`, `FilterLayer`, `ViewPipeline` |
| `core.grid.view-format-uses-raw-keys` | engine, grid | view pipeline + `getViewCellFormat` |
| `core.grid.view-merge-resolves-view-raw` | engine, grid | view pipeline + `getViewMergeRegion` |

### Batch 8: Public Utilities Inventory

**目标:** 对 `packages/core/src/index.ts` 中导出的行为型 pure APIs 建立技术场景，type-only 导出建立矩阵记录。

| id | layer | APIs |
| --- | --- | --- |
| `core.pure.geometry-column-letter` | pure | `columnIndexToLetter` |
| `core.pure.geometry-viewport` | pure | `Viewport` |
| `core.pure.geometry-frozen-regions` | pure | `FrozenRegions` |
| `core.pure.geometry-chunked-axis-boundaries` | pure | `ChunkedAxis`, `CHUNK_SIZE` |
| `core.pure.resize-handles` | pure | `computeResizeHandles`, resize constants |
| `core.pure.context-menu-items` | pure | `getCellContextMenuItems`, `getRowHeaderContextMenuItems`, `getColumnHeaderContextMenuItems` |
| `core.pure.text-measure-wrap` | pure | `tokenize`, `wrapText` |
| `core.L0.undo-command-serialization` | L0 | `UndoCommand` observable serialization helpers already in tests; Core BDD adds smoke only |
| `core.public-api.type-only-inventory` | type-only | all exported `type` names in `index.ts` |

## 5. `Grid` Facade Coverage Matrix

| Method group | APIs | Batch |
| --- | --- | --- |
| data/theme/lifecycle | `setData`, `setTheme`, `refresh`, `destroy`, `_onContainerResize` | 2 |
| layout/scroll | `setRowHeight`, `setColumnWidth`, `setRowHeights`, `setColumnWidths`, `setFrozen`, `scrollToRow`, `scrollToCell`, `autofitRows` | 2 |
| context menu | `openContextMenuAt`, `closeContextMenu`, `getRowHeaderContextMenuItems`, `invokeRowHeaderContextMenuAction`, `getColumnHeaderContextMenuItems`, `invokeColumnHeaderContextMenuAction` | 3 |
| clipboard | `copy`, `cut`, `paste` | 5 |
| history | `undo`, `redo`, `canUndo`, `canRedo`, `onUndo`, `onRedo` | 3 / 6 |
| rows | `insertRows`, `deleteRows`, `hideRows`, `unhideRows`, `getHiddenRows` | 3 |
| cols | `insertCols`, `deleteCols`, `hideCols`, `unhideCols`, `getHiddenCols`, `moveCols` | 3 |
| selection | `setSelection`, `getSelection` | 4 |
| formatting | `setFillColor`, `setBorders`, `setValueFormat`, `setTextWrap`, `getViewCellFormat` | 6 |
| merge | `mergeCells`, `unmergeCells`, `getViewMergeRegion` | 6 |
| view layers | `getSortLayer`, `getFilterLayer`, `getViewPipeline` | 7 |
| events | `on`, `onFill` | 2 / 5 |

## 6. Batch Gate

每批必须按同一顺序执行：

1. 写 / 改 `packages/core/tests/acceptance/**/scenarios/*.md` 场景（按上表域目录落盘）。
2. 跑 `bun run --filter @novasheet/core lint:mbd`，确认场景有效。
3. 跑 `bun run --filter @novasheet/core manifest:mbd`，提交 generated manifest / 清单。
4. 在对应域的 `acceptance/**/*.test.ts` 写 `bun:test` 行为测试并确认红灯来自未实现行为或缺失观测 API。
5. 补最小公开 API 调用 / 观测 API / 实现。
6. 跑 `bun test packages/core/tests/acceptance`。
7. 跑 `bun run --filter @novasheet/core typecheck`。
8. 跑 `bun run lint`；若既有 warning 仍存在，记录来源，不把它归因到本批。
9. 一批一 commit，commit subject 用中文：`test(core): 覆盖 Core 结构变更 BDD 场景`。

## 7. Plan Self-Review

| 检查 | 结果 |
| --- | --- |
| 是否去掉 Core L0–L2 暂缓 | 是；behavioral-testing spec 与 CLAUDE 指针均改为 Phase 1 启动 |
| 是否一次性覆盖所有公开 API 有路径 | 是；Grid facade 全方法分配到 Batch 2–7，public pure exports 放 Batch 8，type-only 用 type inventory |
| 是否仍保留 TDD | 是；BDD 只罩公开可观测行为，kernel 算法和 L4 白盒继续 TDD |
| 是否能分批执行 | 是；Batch 0–8 每批都有独立场景集合和 gate |
| 是否有占位符 | 无 |
