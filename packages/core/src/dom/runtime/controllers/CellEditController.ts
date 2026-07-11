/**
 * CellEditController——内建 DOM 单元格编辑器与自定义单元格编辑器注册表的生命周期
 * （GridRuntime 拆分 Task 7，见
 * `docs/superpowers/specs/2026-07-11-grid-runtime-decomposition-design.md` §3.2）。
 *
 * Custom editor 会话用 token 防旧回调竞态：async 编辑器的 commit/cancel 回调可能在
 * reopen（新会话已启动，且可能复用同一个注册表 editor 实例）或 destroy 之后才触发。
 * `activeCustomEditorToken` 记录当前会话 token，`commitCustomEditorValue`/`closeCustomEditor`
 * 先比对 editor 引用、再比对 token，两者皆匹配才放行——仅比对 editor 引用不够（同类型字段
 * reopen 常复用同一 editor 实例），token 才是决定新旧会话的唯一依据。
 *
 * 对 `RenderFlushPipeline` 暴露 `augmentFrame`（frame 无 `cellEdit` 时合并
 * `activeCustomEditorCellEdit`）与 `syncCellEditorPosition`（flush 的 `syncDomLayers` 钩子）。
 */

import type { AutofitRowsResult } from '../../../features/row/AutofitRowHeights'
import type { DataSource } from '../../../kernel/data/DataSource'
import type { GridEngine } from '../../../engine/GridEngine'
import type { CellValue, Field } from '../../../kernel/data/Schema'
import type { CellAddress } from '../../../kernel/coords/SelectionTypes'
import type { Theme } from '../../../kernel/theme/Theme'
import { computeCellRect } from '../../../kernel/interaction/CellLayout'
import { computeRangeOverlayRects } from '../../overlay/RangeOverlayRects'
import type { DomCellEditor } from '../../interaction/DomCellEditor'
import type { CellActionHit } from '../../../ports/RenderBackend'
import type { CellEditor, CellEditorRegistry, CellEditorTrigger } from '../../interaction/CellEditorContract'
import type { CellTypeDefinition, CellTypeRegistry } from '../../../features/cell-types'
import type { RuntimeRenderFrame, RuntimeCellEdit } from '../runtime-frame'
import type { AutofitRowsRuntimeOptions } from '../GridRuntime'

/** CellEditController 的窄依赖接口——只列它真正需要的 GridRuntime 能力。 */
export interface CellEditControllerDeps {
  readonly engine: GridEngine
  /** Custom editor overlay 的 DOM 宿主；与 grid container 同一局部坐标系。 */
  readonly editorContainer: HTMLElement
  isDestroyed(): boolean
  refresh(): void
  paintSync(): void
  afterEngineMutation(): void
  ensureCellVisible(cell: CellAddress): void
  getSelectionScrollTarget(): CellAddress | null
  autofitRows(options: AutofitRowsRuntimeOptions): AutofitRowsResult
  /**
   * resize 拖拽期间不允许进入编辑态；现由 GridRuntime 转发
   * `DragCoordinator.isResizeDragActive()`（Task 8）。CellEditController 与
   * DragCoordinator 互不 import，故经 deps 回读——brief 深依赖清单未列出此项，
   * 但 `openCellEditorForTrigger` 原体读取它，按"缺 deps 则补一条闭包"规则补上（Task 7）。
   */
  isResizeDragActive(): boolean
}

export class CellEditController {
  private readonly deps: CellEditControllerDeps
  /** 自定义单元格编辑器注册表；key 为 `Field.type`。 */
  private readonly cellEditors: CellEditorRegistry
  /** 自定义单元格类型语义注册表；key 为 `Field.type`。 */
  private readonly cellTypes: CellTypeRegistry
  /** DOM 单元格编辑器。 */
  private cellEditor?: DomCellEditor
  /** 当前由 custom editor registry 打开的 overlay。 */
  private activeCustomEditor: CellEditor | null = null
  /** Custom editor 不一定能进入 engine edit model；runtime 用该帧标记让 canvas 跳过原 cell 文本。 */
  private activeCustomEditorCellEdit: RuntimeCellEdit | null = null
  /** 当前 custom editor 会话 token；reopen/close 后旧 ctx 回调必须失效。 */
  private activeCustomEditorToken: number | null = null
  private nextCustomEditorToken = 1
  /**
   * 多行 wrap 字段编辑中的原始行高快照——取消时恢复，提交时丢弃。
   * 非 multiline 编辑置 null。
   */
  private editingMultilineOriginalRowHeight: number | null = null

  constructor(opts: {
    readonly cellEditors: CellEditorRegistry
    readonly cellTypes: CellTypeRegistry
    readonly deps: CellEditControllerDeps
  }) {
    this.cellEditors = opts.cellEditors
    this.cellTypes = opts.cellTypes
    this.deps = opts.deps
  }

  /** Phase 3.5 — backend 在 runtime 创建后注入编辑器。 */
  setCellEditor(editor: DomCellEditor): void {
    this.cellEditor = editor
    this.syncCellEditorTheme()
  }

  /** 程序化打开单元格编辑器；custom editor 的 trigger 为 `api`。 */
  openCellEditor(rowIndex: number, fieldId: string): boolean {
    if (this.deps.isDestroyed()) return false
    const colIndex = this.deps.engine.getColumnIndex(fieldId)
    if (colIndex < 0) return false
    return this.openCellEditorForTrigger({
      cell: { rowIndex, colIndex },
      trigger: 'api',
      selectAll: false,
    })
  }

  /** 所有进入编辑态的 DOM/API 入口先尝试 custom editor，再回退到内置 DOM editor。 */
  openCellEditorForTrigger(args: {
    readonly cell: CellAddress
    readonly trigger: CellEditorTrigger
    readonly initialInput?: string
    readonly actionId?: string
    readonly selectAll?: boolean
  }): boolean {
    if (this.deps.isResizeDragActive()) return false
    if (this.openCustomCellEditor(args)) return true
    this.closeActiveCustomEditor()
    return this.openBuiltInDomEditor(args)
  }

  hasCustomCellEditor(cell: CellAddress): boolean {
    const frame = this.deps.engine.getFrame()
    const resolved = this.resolveRuntimeField(frame, cell)
    return resolved !== null && this.resolveCellEditorEntry(resolved) !== null
  }

  invokeCellAction(action: CellActionHit): void {
    const frame = this.deps.engine.getFrame()
    const data = frame.data as Partial<Pick<DataSource, 'getCell' | 'getSchema'>>
    const resolved = this.resolveRuntimeField(frame, {
      rowIndex: action.rowIndex,
      colIndex: action.colIndex,
    })
    if (!resolved) return
    const { cell, field } = resolved

    let openEditorPrevented = false
    const value = data.getCell?.(cell.rowIndex, field.id)
    const actionEntry = this.resolveCellTypeDefinitionEntry(resolved)
    actionEntry?.definition.onAction?.({
      field: actionEntry.definitionField,
      locale: 'en-US',
      cell,
      value,
      trigger: 'cell-action',
      rowIndex: cell.rowIndex,
      colIndex: cell.colIndex,
      actionId: action.actionId,
      preventOpenEditor: () => {
        openEditorPrevented = true
      },
      commit: (nextValue) => {
        if (this.deps.engine.commitCellValue(cell, field.id, nextValue)) {
          this.deps.afterEngineMutation()
        }
      },
    })

    if (openEditorPrevented) return
    const opened = this.openCellEditorForTrigger({
      cell,
      trigger: 'cell-action',
      actionId: action.actionId,
      selectAll: false,
    })
    if (!opened) {
      this.deps.engine.selectCell(cell)
      this.deps.afterEngineMutation()
    }
  }

  closeActiveCustomEditor(): void {
    const editor = this.activeCustomEditor
    if (!editor) return
    this.activeCustomEditor = null
    this.activeCustomEditorCellEdit = null
    this.activeCustomEditorToken = null
    editor.close?.()
    if (!this.deps.isDestroyed()) this.deps.paintSync()
  }

  /** 提交当前编辑；可选在提交后移动到下一行。 */
  commitCellEdit(moveAfter: boolean): void {
    if (!this.deps.engine.isCellEditing()) return
    const session = this.deps.engine.getFrame().cellEdit
    const wasMultiline = this.editingMultilineOriginalRowHeight !== null
    const editedRow = session?.cell.rowIndex
    if (!this.deps.engine.commitCellEdit()) return

    this.editingMultilineOriginalRowHeight = null
    this.cellEditor?.close()
    // 失去焦点（Enter 或 blur 提交）才重算行高——交互成本从 N 键 × autofit 降到 1 次
    if (wasMultiline && editedRow !== undefined) {
      this.deps.autofitRows({ rows: [editedRow] })
    }
    if (moveAfter) {
      this.deps.engine.navigateSelection('ArrowDown', false)
      const focus = this.deps.getSelectionScrollTarget()
      if (focus) this.deps.ensureCellVisible(focus)
    }
    this.deps.refresh()
  }

  /** 取消当前编辑，并在 multiline 编辑时恢复原始行高。 */
  cancelCellEdit(): void {
    if (!this.deps.engine.isCellEditing()) {
      this.cellEditor?.close()
      this.editingMultilineOriginalRowHeight = null
      return
    }
    const session = this.deps.engine.getFrame().cellEdit
    const restoreHeight = this.editingMultilineOriginalRowHeight
    const restoreRow = session?.cell.rowIndex
    this.deps.engine.cancelCellEdit()
    this.cellEditor?.close()
    if (restoreHeight !== null && restoreRow !== undefined) {
      const currentHeight = this.deps.engine.getRowsAxis().getSize(restoreRow)
      if (currentHeight !== restoreHeight) {
        this.deps.engine.setRowHeight(restoreRow, restoreHeight)
        this.deps.afterEngineMutation()
      }
    }
    this.editingMultilineOriginalRowHeight = null
  }

  /** 同步编辑器 draft 到 engine 的 cell edit session。 */
  handleCellEditDraft(draft: string): void {
    if (this.deps.isDestroyed()) return
    this.deps.engine.updateCellEditDraft(draft)
  }

  /** 处理 Enter 提交编辑，并在成功后移动到下一行。 */
  handleCellEditCommitEnter(): void {
    this.commitCellEdit(true)
  }

  /** 处理 blur 提交编辑，保持当前选区不移动。 */
  handleCellEditCommitBlur(): void {
    this.commitCellEdit(false)
  }

  /** 取消当前编辑并刷新编辑器/选区显示。 */
  handleCellEditCancel(): void {
    if (this.deps.isDestroyed()) return
    this.cancelCellEdit()
    this.deps.refresh()
  }

  /** 根据当前单元格 rect 同步编辑器位置；不可见时取消编辑。flush 路径复用已构建的 frame，避免重复 getFrame。 */
  syncCellEditorPosition(frame?: RuntimeRenderFrame): void {
    if (!this.cellEditor?.isOpen()) return
    const f = frame ?? this.deps.engine.getFrame()
    const session = f.cellEdit
    if (!session) {
      this.cellEditor.close()
      return
    }
    const rect = this.computeCellEditorRect(f, session.cell)
    if (!rect) {
      this.cancelCellEdit()
      return
    }
    this.cellEditor.syncRect(rect)
  }

  /** flush 的 `augmentFrame` 钩子：frame 自身无 cellEdit 时合并 activeCustomEditorCellEdit。 */
  augmentFrame(frame: RuntimeRenderFrame): RuntimeRenderFrame {
    return this.activeCustomEditorCellEdit && !frame.cellEdit
      ? { ...frame, cellEdit: this.activeCustomEditorCellEdit }
      : frame
  }

  /** 同步 cell editor 主题（`syncCellEditorTheme` 体，theme 由 caller 显式传入）。 */
  applyTheme(theme: Theme): void {
    this.cellEditor?.applyTheme(theme)
  }

  /** 幂等销毁：关当前自定义编辑器 + 内建编辑器，并销毁注册表内全部编辑器实例。 */
  destroy(): void {
    this.closeActiveCustomEditor()
    this.cancelCellEdit()
    for (const editor of Object.values(this.cellEditors)) editor.destroy?.()
  }

  private resolveRuntimeField(
    frame: RuntimeRenderFrame,
    cell: CellAddress,
  ): {
    readonly cell: CellAddress
    readonly field: Field
    readonly resolvedField: Field
    readonly hasExplicitCellTypeOverride: boolean
  } | null {
    const data = frame.data as Partial<Pick<DataSource, 'getSchema'>>
    const editCell = this.resolveEditCell(frame, cell)
    const field = data.getSchema?.().fields[editCell.colIndex]
    if (!field) return null
    const resolvedType = frame.resolveCellType?.(editCell.rowIndex, editCell.colIndex, field) ?? field.type
    const hasExplicitCellTypeOverride = frame.hasCellTypeOverride?.(editCell.rowIndex, editCell.colIndex) === true
    const resolvedField = resolvedType === field.type ? field : { ...field, type: resolvedType }
    return { cell: editCell, field, resolvedField, hasExplicitCellTypeOverride }
  }

  private resolveCellEditorEntry(
    resolved: NonNullable<ReturnType<CellEditController['resolveRuntimeField']>>,
  ): { readonly editor: CellEditor; readonly editorField: Field } | null {
    const resolvedEditor = this.cellEditors[resolved.resolvedField.type]
    if (resolvedEditor) {
      return { editor: resolvedEditor, editorField: resolved.resolvedField }
    }
    if (resolved.hasExplicitCellTypeOverride) return null
    const fieldEditor = this.cellEditors[resolved.field.type]
    if (fieldEditor) {
      return { editor: fieldEditor, editorField: resolved.field }
    }
    return null
  }

  private resolveCellTypeDefinitionEntry(
    resolved: NonNullable<ReturnType<CellEditController['resolveRuntimeField']>>,
  ): { readonly definition: CellTypeDefinition; readonly definitionField: Field } | null {
    const resolvedDefinition = this.cellTypes[resolved.resolvedField.type]
    if (resolvedDefinition) {
      return { definition: resolvedDefinition, definitionField: resolved.resolvedField }
    }
    if (resolved.hasExplicitCellTypeOverride) return null
    const fieldDefinition = this.cellTypes[resolved.field.type]
    if (fieldDefinition) {
      return { definition: fieldDefinition, definitionField: resolved.field }
    }
    return null
  }

  private openCustomCellEditor(args: {
    readonly cell: CellAddress
    readonly trigger: CellEditorTrigger
    readonly initialInput?: string
    readonly actionId?: string
  }): boolean {
    const frame = this.deps.engine.getFrame()
    const data = frame.data as Partial<Pick<DataSource, 'getCell' | 'getSchema'>>
    const resolved = this.resolveRuntimeField(frame, args.cell)
    if (!resolved) return false
    const { cell, field } = resolved

    const editorEntry = this.resolveCellEditorEntry(resolved)
    if (!editorEntry) return false
    const { editor, editorField } = editorEntry

    const rect = this.computeCellEditorRect(frame, cell)
    if (!rect) return false

    this.closeActiveCustomEditor()
    const value = data.getCell?.(cell.rowIndex, field.id)
    const token = this.nextCustomEditorToken
    this.nextCustomEditorToken += 1
    this.activeCustomEditor = editor
    this.activeCustomEditorCellEdit = {
      cell,
      fieldId: field.id,
      fieldType: editorField.type,
      draft: value == null ? '' : String(value),
    }
    this.activeCustomEditorToken = token
    this.deps.paintSync()
    editor.open({
      cell,
      field: editorField,
      value,
      container: this.deps.editorContainer,
      rect,
      trigger: args.trigger,
      initialInput: args.initialInput,
      actionId: args.actionId,
      commit: (value) => this.commitCustomEditorValue(cell, field, value, editor, token),
      setAttachment: (namespace, data) =>
        this.deps.engine.setCellAttachment(
          namespace,
          this.deps.engine.viewRowToRaw(cell.rowIndex),
          this.deps.engine.viewColToRaw(cell.colIndex),
          data,
        ),
      getAttachment: (namespace) =>
        this.deps.engine.getCellAttachment(
          namespace,
          this.deps.engine.viewRowToRaw(cell.rowIndex),
          this.deps.engine.viewColToRaw(cell.colIndex),
        ),
      cancel: () => this.closeCustomEditor(editor, token),
    })
    return true
  }

  private commitCustomEditorValue(
    cell: CellAddress,
    field: Field,
    value: CellValue | null,
    editor: NonNullable<CellEditorRegistry[string]>,
    token: number,
  ): void {
    if (this.activeCustomEditor !== editor || this.activeCustomEditorToken !== token) return
    if (!this.deps.engine.commitCellValue(cell, field.id, value)) return
    this.closeCustomEditor(editor, token)
    this.deps.afterEngineMutation()
  }

  private closeCustomEditor(editor: CellEditor, token?: number): void {
    if (this.activeCustomEditor !== editor) return
    if (token !== undefined && this.activeCustomEditorToken !== token) return
    this.activeCustomEditor = null
    this.activeCustomEditorCellEdit = null
    this.activeCustomEditorToken = null
    editor.close?.()
    if (!this.deps.isDestroyed()) this.deps.paintSync()
  }

  /** 打开内置 DOM 单元格编辑器，并按需写入初始 draft。 */
  private openBuiltInDomEditor(args: {
    readonly cell: CellAddress
    readonly initialInput?: string
    readonly selectAll?: boolean
  }): boolean {
    if (!this.cellEditor) return false
    if (!this.deps.engine.beginCellEdit(args.cell)) return false
    if (args.initialInput !== undefined) this.deps.engine.updateCellEditDraft(args.initialInput)
    return this.showCellEditor({ selectAll: args.selectAll ?? false })
  }

  /** 根据当前 engine edit session 定位并展示 DOM cell editor。 */
  private showCellEditor(options: { selectAll?: boolean }): boolean {
    const frame = this.deps.engine.getFrame()
    const session = frame.cellEdit
    const rect = session ? this.computeCellEditorRect(frame, session.cell) : null
    if (!session || !rect || !this.cellEditor) {
      this.deps.engine.cancelCellEdit()
      return false
    }

    // 任意非 number 格都用多行编辑器：支持 Alt+Enter 硬换行（与 Google 表格一致），
    // 提交时按内容 autofit 行高。number 仍单行。
    const multiline = session.fieldType !== 'number'

    this.editingMultilineOriginalRowHeight = multiline
      ? this.deps.engine.getRowsAxis().getSize(session.cell.rowIndex)
      : null

    this.deps.paintSync()
    this.cellEditor.open(rect, session.draft, { ...options, multiline })
    return true
  }

  private computeCellEditorRect(frame: RuntimeRenderFrame, cell: CellAddress) {
    const mergeRange = (frame.mergeRegions ?? []).find(
      (merge) =>
        cell.rowIndex >= merge.range.startRow &&
        cell.rowIndex <= merge.range.endRow &&
        cell.colIndex >= merge.range.startCol &&
        cell.colIndex <= merge.range.endCol,
    )?.range
    if (mergeRange) return computeRangeOverlayRects(frame, mergeRange).at(-1) ?? null
    return computeCellRect(frame, cell)
  }

  private resolveEditCell(frame: RuntimeRenderFrame, cell: CellAddress): CellAddress {
    const merge = (frame.mergeRegions ?? []).find(
      (region) =>
        cell.rowIndex >= region.range.startRow &&
        cell.rowIndex <= region.range.endRow &&
        cell.colIndex >= region.range.startCol &&
        cell.colIndex <= region.range.endCol,
    )
    if (!merge) return cell
    return merge.anchor ?? { rowIndex: merge.range.startRow, colIndex: merge.range.startCol }
  }

  /** 同步 cell editor 主题；`applyTheme` 需要显式 theme，此处从 deps.engine 取当前主题。 */
  private syncCellEditorTheme(): void {
    this.applyTheme(this.deps.engine.getTheme())
  }
}
