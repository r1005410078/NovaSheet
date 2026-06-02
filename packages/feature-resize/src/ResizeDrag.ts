import { MIN_RESIZE_SIZE, type GridEngine, type ResizeHandleRect } from '@novasheet/core'
import type { DomHandleLayer } from '../DomHandleLayer'
import type { WebPointerEvent } from '../../host/WebHost'
import type { AutoScrollAxis, Drag } from './Drag'

/** ResizeDrag 所需的 runtime 交互服务。 */
export interface ResizeDragDeps {
  readonly engine: GridEngine
  readonly handleLayer?: DomHandleLayer
  afterEngineMutation(): void
}

interface ResizeState {
  handle: ResizeHandleRect
  pointerId: number
  startClientX: number
  startClientY: number
  startSize: number
  anchorStart: number
  previewSize: number
}

/** 行高/列宽 resize 拖拽状态机（R1 DragController）。 */
export class ResizeDrag implements Drag {
  readonly autoScrollAxis: AutoScrollAxis = null
  private state: ResizeState | null = null

  constructor(private readonly deps: ResizeDragDeps) {}

  get active(): boolean {
    return this.state !== null
  }

  tryStart(_event: WebPointerEvent): boolean {
    return false
  }

  start(handle: ResizeHandleRect, pointerId: number, clientX: number, clientY: number): boolean {
    const startSize = this.readSize(handle)
    if (startSize === null) return false
    const edge =
      handle.kind === 'column' ? handle.x + handle.width / 2 : handle.y + handle.height / 2
    this.state = {
      handle,
      pointerId,
      startClientX: clientX,
      startClientY: clientY,
      startSize,
      anchorStart: edge - startSize,
      previewSize: startSize,
    }
    this.showIndicator(startSize)
    return true
  }

  move(_event: WebPointerEvent): boolean {
    return this.state !== null
  }

  movePointer(pointerId: number, clientX: number, clientY: number): boolean {
    if (!this.state || this.state.pointerId !== pointerId) return false
    const nextSize = this.computeSize(this.state, clientX, clientY)
    this.state.previewSize = nextSize
    this.showIndicator(nextSize)
    return true
  }

  commitPointer(pointerId: number): boolean {
    if (!this.state || this.state.pointerId !== pointerId) return false
    this.commit()
    return true
  }

  reevaluate(_pointer: WebPointerEvent): void {}

  commit(): void {
    const state = this.state
    this.state = null
    if (!state) return
    this.deps.handleLayer?.hideIndicator()
    const { handle, startSize, previewSize } = state
    if (previewSize === startSize) return
    if (handle.kind === 'row' && handle.rowIndex !== undefined) {
      this.deps.engine.commitRowResize(handle.rowIndex, startSize, previewSize)
    } else if (handle.kind === 'column' && handle.fieldId) {
      const colIndex = this.deps.engine.getColumnIndex(handle.fieldId)
      if (colIndex < 0) return
      this.deps.engine.commitColumnResize(colIndex, startSize, previewSize)
    }
    this.deps.afterEngineMutation()
  }

  cancel(): void {
    this.state = null
    this.deps.handleLayer?.hideIndicator()
  }

  private readSize(handle: ResizeHandleRect): number | null {
    if (handle.kind === 'column' && handle.fieldId) {
      const colIndex = this.deps.engine.getColumnIndex(handle.fieldId)
      if (colIndex < 0) return null
      return this.deps.engine.getColsAxis().getSize(colIndex)
    }
    if (handle.kind === 'row' && handle.rowIndex !== undefined) {
      const { rowIndex } = handle
      if (rowIndex < 0 || rowIndex >= this.deps.engine.getRowsAxis().getCount()) return null
      return this.deps.engine.getRowsAxis().getSize(rowIndex)
    }
    return null
  }

  private computeSize(state: ResizeState, clientX: number, clientY: number): number {
    const delta =
      state.handle.kind === 'column' ? clientX - state.startClientX : clientY - state.startClientY
    return Math.max(MIN_RESIZE_SIZE, state.startSize + delta)
  }

  private showIndicator(size: number): void {
    if (!this.deps.handleLayer || !this.state) return
    const { handle, anchorStart } = this.state
    if (handle.kind === 'column') {
      this.deps.handleLayer.showIndicator({ kind: 'column', x: anchorStart + size })
      return
    }
    this.deps.handleLayer.showIndicator({ kind: 'row', y: anchorStart + size })
  }
}
