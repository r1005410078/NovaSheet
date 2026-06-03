import type { CellAddress, RenderFrame } from '@novasheet/core'
import type {
  WebCellEditor,
  WebCellEditorRuntimeDeps,
  WebFrameSync,
  WebInteractionStatus,
} from '@novasheet/web'
import { DomCellEditor } from './DomCellEditor'
import { computeCellEditorRect } from './computeCellEditorRect'

export type EditingControllerDeps = WebCellEditorRuntimeDeps

/**
 * 单元格编辑控制器：WebCellEditor(命令) + WebFrameSync(定位)，自持 DomCellEditor。
 *
 * 编辑语义全部经 engine；DOM 编辑器回调直达本控制器；定位/主题在 syncFrame 每帧同步。
 */
export class EditingController implements WebCellEditor, WebFrameSync {
  private editor: DomCellEditor | null = null
  private multilineOriginalRowHeight: number | null = null

  constructor(private readonly deps: EditingControllerDeps) {}

  // --- WebFrameSync ---

  attach(container: HTMLElement): void {
    this.editor = new DomCellEditor(container, {
      onDraftChange: (draft) => this.deps.engine.updateCellEditDraft(draft),
      onCommitEnter: () => this.commitActive(true),
      onCommitBlur: () => this.commitActive(false),
      onCancel: () => {
        this.cancelActive()
        this.deps.refresh()
      },
    })
    this.editor.attach()
  }

  syncFrame(frame: RenderFrame, _status: WebInteractionStatus): void {
    if (!this.editor?.isOpen()) return
    const session = frame.cellEdit
    if (!session) {
      this.editor.close()
      return
    }
    const rect = computeCellEditorRect(frame, session.cell)
    if (!rect) {
      this.cancelActive()
      return
    }
    this.editor.applyTheme(frame.theme)
    this.editor.syncRect(rect)
  }

  destroy(): void {
    this.editor?.destroy()
    this.editor = null
  }

  // --- WebCellEditor ---

  open(cell: CellAddress, options: { selectAll?: boolean }): boolean {
    if (!this.editor || this.deps.isBlocked()) return false
    if (this.deps.tryCustomEditor(cell)) return true
    if (!this.deps.engine.beginCellEdit(cell)) return false
    return this.showEditor(options)
  }

  beginWithDraft(cell: CellAddress, draft: string): boolean {
    if (!this.editor || this.deps.isBlocked()) return false
    if (this.deps.tryCustomEditor(cell)) return true
    if (!this.deps.engine.beginCellEdit(cell)) return false
    this.deps.engine.updateCellEditDraft(draft)
    return this.showEditor({ selectAll: false })
  }

  commitActive(moveAfter: boolean): void {
    const engine = this.deps.engine
    if (!engine.isCellEditing()) return
    const session = engine.getFrame().cellEdit
    const wasMultiline = this.multilineOriginalRowHeight !== null
    const editedRow = session?.cell.rowIndex
    if (!engine.commitCellEdit()) return
    this.multilineOriginalRowHeight = null
    this.editor?.close()
    // 失去焦点（Enter 或 blur 提交）才重算行高——交互成本从 N 键 × autofit 降到 1 次。
    if (wasMultiline && editedRow !== undefined) {
      this.deps.autofitRows({ rows: [editedRow] })
    }
    if (moveAfter) {
      engine.navigateSelection('ArrowDown', false)
      this.deps.revealActiveCell()
    }
    this.deps.refresh()
  }

  cancelActive(): void {
    const engine = this.deps.engine
    if (!engine.isCellEditing()) {
      this.editor?.close()
      this.multilineOriginalRowHeight = null
      return
    }
    const session = engine.getFrame().cellEdit
    const restoreHeight = this.multilineOriginalRowHeight
    const restoreRow = session?.cell.rowIndex
    engine.cancelCellEdit()
    this.editor?.close()
    if (restoreHeight !== null && restoreRow !== undefined) {
      const currentHeight = engine.getRowsAxis().getSize(restoreRow)
      if (currentHeight !== restoreHeight) {
        engine.setRowHeight(restoreRow, restoreHeight)
        this.deps.afterEngineMutation()
      }
    }
    this.multilineOriginalRowHeight = null
  }

  /** 根据当前 engine edit session 定位并展示 DOM 编辑器。 */
  private showEditor(options: { selectAll?: boolean }): boolean {
    const engine = this.deps.engine
    const frame = engine.getFrame()
    const session = frame.cellEdit
    const rect = session ? computeCellEditorRect(frame, session.cell) : null
    if (!session || !rect || !this.editor) {
      engine.cancelCellEdit()
      return false
    }
    const field = engine.getData().getSchema?.().fields[session.cell.colIndex]
    // 任意非 number 格用多行编辑器（Alt+Enter 硬换行，提交时 autofit）；number 单行。
    const multiline = field ? field.type !== 'number' : true
    this.multilineOriginalRowHeight = multiline
      ? engine.getRowsAxis().getSize(session.cell.rowIndex)
      : null
    this.deps.requestSyncPaint()
    this.editor.applyTheme(engine.getTheme())
    this.editor.open(rect, session.draft, { ...options, multiline })
    return true
  }
}
