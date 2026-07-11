# GridRuntime 分解设计(dom/runtime 架构优化)

- **日期:** 2026-07-11
- **状态:** 设计定稿,待 plan
- **基线:** `main` @ 370ddd5(`refactor-default-grid-engine-decomposition` 分支不触碰 `dom/`,无冲突风险)

## 1. 问题

`packages/core/src/dom/runtime/GridRuntime.ts` 已 2981 行,聚合了 11+ 个职责簇。四个痛点:

| 痛点 | 现状证据 |
| --- | --- |
| 文件过大难维护 | 单文件 2981 行;`captureSelectionAttachments` 143 行、`handleHostContextMenu` 136 行 |
| 阻碍后续功能 | backlog 的单元格自定义类型扩展 API(editor 注册缝)将继续向编辑域加代码 |
| 职责边界错位 | ~30 个 mutation passthrough 方法只做 delegate engine + invalidate,runtime 当了 mutation 中间人,与不变量 #2/#3(facade 决定 invalidate)错位 |
| 可测试性 | 测任一域行为需拉起完整 runtime wiring;各域无法独立构造 |

## 2. 目标与非目标

**目标:**

- GridRuntime 退化为组合根(实测 Phase 1 完成后 1226 行,Phase 2 预期降至约 1100 行——8-controller wiring + ~32 个 mutation passthrough + setter/回调注册,原估"~400 行"低估组合根本身体量):constructor wiring、生命周期、跨域编排点。
- 每个领域一个 controller,窄 deps 接口注入,独立可构造、可单测。
- mutation passthrough 移出 runtime,`GridControllerImpl` 直调 engine。
- 公开 API golden 不变(只记录导出名,`GridRuntime` 名保留);acceptance 场景零改动(纯重构,不改可观测行为)。

**非目标:**

- 不改渲染行为、不改 engine 层、不动 `refactor-default-grid-engine-decomposition` 分支范围。
- 不在本次实现 editor 注册缝本身(只为它留出 `CellEditController` 宿主)。
- 不重构 `GridControllerImpl` 除 Phase 2 mutation 改道以外的部分。

## 3. 目标形态

### 3.1 文件布局

```
dom/runtime/
  GridRuntime.ts              1226 行(Phase 1 完成实测,Phase 2 预期降至约 1100)组合根 + 生命周期 + 跨域编排
  GridController.ts           (不变)
  GridControllerImpl.ts       (Phase 2 mutation 改道后略增)
  RenderFlushPipeline.ts      106 行  invalidate/paintSync/getRenderFrame + sync* 扇出
  controllers/
    CellEditController.ts     474 行  内建 DOM editor + 自定义 editor 生命周期
    ContextMenuController.ts  649 行  host/行头/列头菜单、action 分发、hover 菜单按钮
    PopoverController.ts      148 行  filter/rowHeight/columnWidth popover + pending ids
    ClipboardController.ts    308 行  snapshot、attachment 捕获、copy/cut/paste、undo/redo
    ViewportController.ts     246 行  scroll 映射、spacer、scrollTo*、resize 调度
    InputController.ts        376 行  pointer/keyboard 路由、header 命中/整行列选择、validation tooltip
    DragCoordinator.ts        405 行  5 个 Drag 实例、activeDrag、auto-scroll tick
    ExcelWorkspaceBinding.ts  132 行  workspace port/frame/scroll 记录
```

(以上为 Phase 1 全部 9 task 完成后的实测行数,原设计阶段的估算普遍偏低,尤以 GridRuntime.ts 组合根本身为甚——不影响拆分本身的架构价值,仅记录以便后续参考。)

controllers 与 RenderFlushPipeline **不从 `dom/index.ts` 导出**(包内私有);`GridRuntime` 导出保留。

### 3.2 职责分派

| 模块 | 迁入成员(现 GridRuntime 内) | 说明 |
| --- | --- | --- |
| RenderFlushPipeline | `invalidate`/`paintSync`/`getRenderFrame`、7 个 `sync*`(经 deps 扇出到各域)、`notifySelectionChange`、`lastSelectionChangeSignature` | 保住 5cf2612 单帧构建 frame 优化:flush 一次 `getFrame`,同帧下传所有 sync |
| ViewportController | `handleHostScroll`、`remapScroll`、`mapScrollToLogical`、`logicalToScrollX/Y`、`getScrollLimits`、`resizeSpacer`、`getColsContentWidth`、`getColsTotalSizeForFrame`、`scrollToRow/scrollToCell`、`ensureCellVisible`、`getSelectionScrollTarget`、`scheduleHostResize`、`onContainerResize`、`scrollMapper` 持有 | ScrollMapper `SAFE_MAX` 语义不变 |
| InputController | `handleHostPointerDown/Move/Up`、`handleHostDoubleClick`、`handleHostKeyDown`、`updateHeaderCursor`、`hitTestColumnHeader/RowHeader`、`isWholeColumn/RowSelection`、`selectWholeColumn(Range)/selectWholeRowRange`、`updateValidationTooltip`、`computeValidationCellRect` | keyDown 只做路由,剪贴板/编辑/导航动作走 deps |
| DragCoordinator | 5 个 Drag 实例构造与持有、`drags`、`activeDrag`、`isDragBlocked`、`requestDragAutoScroll`/`stopDragAutoScroll`/`updateDragAutoScroll`/`tickDragAutoScroll`/`computeDragAutoScrollStep`/`reevaluateDragAfterAutoScroll`/`activeAutoScrollDrag`、`lastDragPointer`、`handleResizePointer*`、`handleFillPointer*`、`handleResizeKeyboard` | Drag deps 闭包改由 DragCoordinator deps 转发 |
| CellEditController | `cellEditor`、`cellEditors`/`cellTypes` 注册表、`activeCustomEditor*` 三态 + token、`editingMultilineOriginalRowHeight`、`openCellEditorForTrigger`、`resolveRuntimeField`、`resolveCellEditorEntry`、`resolveCellTypeDefinitionEntry`、`hasCustomCellEditor`、`invokeCellAction`、`openCustomCellEditor`、`commitCustomEditorValue`、`closeCustomEditor`、`closeActiveCustomEditor`、`openBuiltInDomEditor`、`showCellEditor`、`commitCellEdit`、`cancelCellEdit`、`syncCellEditorPosition`、`computeCellEditorRect`、`resolveEditCell`、`handleCellEditDraft/CommitEnter/CommitBlur/Cancel`、`openCellEditor` | 未来 editor 注册缝的宿主;对 flush 暴露 `augmentFrame`(合并 `activeCustomEditorCellEdit`)与 `syncPosition` 钩子 |
| ContextMenuController | `contextMenuLayer`/`contextMenuRenderer`/`contextMenus`、`lastContextMenuContext/Point`、`handleHostContextMenu`、`handleContextMenuSelected`、`getRow/ColumnHeaderContextMenuItems`、`invoke*ContextMenuAction`、`openResolvedContextMenu`、`markUnhandledCustomItemsDisabled`、`isBuiltInContextMenuAction`、`openContextMenuAt`、`closeContextMenu`、`lastHoveredColumnMenu`、`updateHoveredColumnHeaderMenu`、`hitTestColumnHeaderMenuButton`、`openColumnHeaderContextMenu`、`viewColToFieldId`、`rawSchemaIndexBefore/AfterViewCol`、`collectHiddenInViewColRange`、`onContextMenuAction` | `BUILTIN_CONTEXT_MENU_ACTIONS`、菜单按钮常量随迁 |
| PopoverController | `filterPopover`/`rowHeightPopover`/`columnWidthPopover`、`pendingRowHeightIds`/`pendingColumnWidthFieldIds`、`openFilterPopover`、`handleFilterPopoverApply`、`filterPopoverFieldId` | 菜单打开 popover 走 deps |
| ClipboardController | `clipboardAdapter`、`clipboardCache`、`snapshotSelection`、`captureSelectionAttachments`、`onCopy/onCut/onPaste/onPasteSkipped` 回调、`undo`/`redo`、`canUndo/canRedo`、`onUndo/onRedo` 回调 | undo/redo 与剪贴板同属"用户级操作 + 事件"域,归此;`fnv1aHash` 随迁 |
| ExcelWorkspaceBinding | `excelWorkspaceController`、`excelWorkspaceMutated`、`recordExcelWorkspaceScroll`、`runExcelWorkspaceFrame`、`createExcelWorkspacePort` | port 闭包改经 deps |
| GridRuntime(保留) | constructor wiring、`attach`/`destroy`、`setData`/`replaceRenderer`/`setTheme`/`setMeasurer`/`refresh`、`setCellEditor` 等 setter 注入(转发)、`setOn*` 回调注册(转发)、`afterEngineMutation`、`autofitRows`、theme 同步 `sync*Theme`、Phase 1 期间的 mutation passthrough | `afterEngineMutation` 是跨域扇出点(viewport 重算 + 关菜单 + 关自定义 editor + 清 drag),必须留在组合根 |

### 3.3 依赖模式(锁定)

沿用现有 Drag 类的**窄 deps-object + 闭包注入**惯例:

- 每个 controller 声明自己的 `XxxDeps` 接口,只列它真正需要的能力(engine 子集、`invalidate()`、`getFrame()`、跨域动作闭包)。
- GridRuntime constructor 是唯一 wiring 点,用箭头闭包把各 controller 的能力互相接线。
- **controller 之间不 import 彼此的类**;跨域调用(FillHandleDrag→`commitCellEdit`、菜单→filter popover、keyDown→clipboard)全部走 deps 闭包。消除环形 import。
- `FrameScheduler` 实例经 deps 注入,controller 不许自建(不变量 #6)。

### 3.4 跨域契约(易错点,plan 必须覆盖)

| 契约 | 内容 |
| --- | --- |
| flush 单帧 | RenderFlushPipeline 每次 flush 只调一次 `engine.getFrame()`,经 `augmentFrame`(edit 域)增强后同帧下传所有 sync 钩子;禁止 sync 钩子内部再 `getFrame()`(现 `sync*` 的 `frame ?? this.engine.getFrame()` fallback 仅为独立调用场景保留) |
| afterEngineMutation | 签名与语义不变,GridRuntime 上保留 public;内部扇出:`viewport.recalc()` → `flush.refresh()` → `contextMenu.close()` → `edit.closeActiveCustomEditor()` → `drag.reset()` |
| destroy 幂等 | 每 controller 实现 `destroy()`,GridRuntime.destroy 扇出;二次 destroy 无副作用(不变量 #7,StrictMode 测试为准) |
| 坐标系 | controller 迁移不改任何 raw/view 转换逻辑;`viewColToFieldId` 等助手随其唯一调用域走 |

## 4. 分阶段执行

### Phase 1 — 机械拆分(9 tasks,每 task 一域一 commit)

每 task:新建 controller/pipeline 文件 + 成员整体迁移 + GridRuntime 内原方法改一行 delegate。**GridRuntime 公开面零变化,`tests/dom/runtime/` 现有测试不改且全绿。**

拆分顺序(耦合度低→高):

1. ExcelWorkspaceBinding
2. ViewportController
3. RenderFlushPipeline
4. ClipboardController
5. PopoverController
6. ContextMenuController
7. CellEditController
8. DragCoordinator
9. InputController(keyDown 跨域最广,依赖 4/7/8 的 deps 已就位,最后拆)

每 task 附带:该 controller 的独立构造单测(最小 deps stub,验证核心行为可脱离 runtime 测试)。

### Phase 2 — mutation passthrough 重划(2 tasks)

**Task 10:** `GridControllerImpl` 中 mutation 调用从 `this.runtime.xxx(...)` 改为 `this.engine.xxx(...)` + `this.runtime.afterEngineMutation()`;GridRuntime 删除对应 passthrough。涉及方法(以实际代码为准,约 30 个):`insertRows/deleteRows/hideRows/unhideRows/setRowHeights/getHiddenRows`、`insertCols/deleteCols/hideCols/unhideCols/setColumnWidths/getHiddenCols/moveCols`、`setFillColor/setBorders/setValueFormat/setCellType/clearCellType/setTextWrap/mergeCells/unmergeCells`、`setValidation/clearValidation`、`setCellAttachment/getCellAttachment/getCellText`、`setSelection/getSelection`、`setRowHeight/setColumnWidth/setFrozen`。

特例处理:

| 特例 | 处理 |
| --- | --- |
| `insertRows`/`insertCols` 返回 ids/Fields | GridControllerImpl 直调 engine 拿返回值,再 `afterEngineMutation()` |
| `undo`/`redo`(fire 事件 + 剪贴板语义) | 非 passthrough,已在 Phase 1 归 ClipboardController,Phase 2 不动 |
| 返回 `boolean` 的 format/merge 域方法 | `false`(sort/filter 打散 no-op)时**不调** `afterEngineMutation`,语义保持 |
| 只读方法(`getHiddenRows/getCellText` 等) | 直调 engine,无 afterEngineMutation |

**Task 11:** `tests/dom/runtime/` 中直调 runtime mutation 的白盒测试改指向 engine + `afterEngineMutation`;确认公开 API golden 无 diff。

## 5. 测试与验证

- 每 task gate:`bun test` + `bun run --filter '*' typecheck` + `bun run lint`(含 `lint:architecture`)全绿才 commit。
- BDD 外环:acceptance 场景与 golden 零改动(纯重构);`lint:scenario-coverage` 不退化。
- Phase 1 以现有 `tests/dom/runtime/*.test.ts` 为行为不变基准;新 controller 单测为增量。
- 收尾:dispatch code-reviewer,重点审 deps 接口最小性、destroy 幂等、flush 单帧契约。

## 6. 风险

| 风险 | 缓解 |
| --- | --- |
| `handleHostKeyDown` 拆分错分支(剪贴板/编辑/导航三域交织) | InputController 只路由,动作全走 deps;task prompt 标注 STOP+ASK:任何快捷键行为语义不明时停 |
| deps 闭包接线遗漏导致运行时 undefined 调用 | typecheck strict + 每 controller 构造单测;deps 接口全 required(可选能力显式 `?` 并在调用点 guard) |
| flush 拆出后 sync 钩子偷偷重复 `getFrame` | RenderFlushPipeline 单测断言 `getFrame` 调用次数(沿用 GridRuntime.frame-dedup.test.ts 模式) |
| Phase 2 漏改某 passthrough 的 invalidate 语义(如 `false` 返回不刷新) | Task 10 逐方法核对现实现;plan 内列全方法清单与各自语义 |
