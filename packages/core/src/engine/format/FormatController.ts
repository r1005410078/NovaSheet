import type { RangeStyleStore } from '../../format/RangeStyleStore'
import type { MergeStore } from '../../merge/MergeStore'
import type {
  BorderPreset,
  BorderStyle,
  FormatLayer,
  TextWrapMode,
} from '../../format/CellFormat'
import type { CellRange, GridSelection } from '../selection/SelectionTypes'
import type { RawRange } from '../../view/coordinates'
import type { UndoCommand } from '../../undo/UndoCommand'

/** FormatController 编排所需的 engine 能力（view→raw 翻译、undo 入栈、选区读写）。 */
export interface FormatControllerContext {
  /** view range → raw range；排序/筛选打乱使映射非连续时返回 null。 */
  translateRange(range: CellRange): RawRange | null
  /** 入栈一条 undo 命令。 */
  pushUndo(command: UndoCommand): void
  /** 当前选区快照，用于 undo before/after 记录。 */
  getSelection(): GridSelection
  /** 选中 view range（mergeCells 成功后选整块）。 */
  selectRange(range: CellRange): void
}

/**
 * Format/Merge 写入门面 + 编排器（**非** CQRS command handler，format mutation 不产领域事件）。
 *
 * 拥有 5 个正向 mutation 的完整编排：view→raw 翻译、store 写入、快照对比、undo 入栈、
 * mergeCells 的选区联动。undo **restore**（applyUndo/applyRedo 的统一 switch）仍在
 * `DefaultGridEngine`，与 selection 一致（undo replay 拆分为后续项）。
 * 定位与依据同 `selection/SelectionController`：写入门面 + 跨聚合协调（Format×Merge×Selection）。
 */
export class FormatController {
  constructor(
    private readonly formatStore: RangeStyleStore,
    private readonly mergeStore: MergeStore,
    private readonly ctx: FormatControllerContext,
  ) {}

  /** 设置 view `range` 填充色；`color === null` 清除。快照前后一致则不入栈返回 false。 */
  setFillColor(range: CellRange, color: string | null): boolean {
    const rawRange = this.ctx.translateRange(range)
    if (!rawRange) return false
    const selectionBefore = this.ctx.getSelection()
    const before = this.formatStore.snapshot()
    if (color === null) {
      this.formatStore.clearFill(rawRange)
    } else {
      this.formatStore.apply(rawRange, { fillColor: color })
    }
    return this.commitFormatChange(before, selectionBefore)
  }

  /** 设置 view `range` 文本显示模式（overflow/wrap/clip）。 */
  setTextWrap(range: CellRange, mode: TextWrapMode): boolean {
    const rawRange = this.ctx.translateRange(range)
    if (!rawRange) return false
    const selectionBefore = this.ctx.getSelection()
    const before = this.formatStore.snapshot()
    this.formatStore.apply(rawRange, { textWrap: mode })
    return this.commitFormatChange(before, selectionBefore)
  }

  /**
   * 给 view `range` 设置边框；`preset === 'clear'` 需 `border === null` 并清除，
   * 否则需 `border !== null`。Phase 5-B 起支持全部 `lineStyle`。`range` 须已归一化。
   */
  setBorders(range: CellRange, preset: BorderPreset, border: BorderStyle | null): boolean {
    if (preset === 'clear') {
      if (border !== null) return false
    } else if (border === null) {
      return false
    }
    const rawRange = this.ctx.translateRange(range)
    if (!rawRange) return false
    const selectionBefore = this.ctx.getSelection()
    const before = this.formatStore.snapshot()
    if (preset === 'clear') {
      this.formatStore.applyBorders(rawRange, 'clear')
    } else {
      this.formatStore.applyBorders(rawRange, preset, border!)
    }
    return this.commitFormatChange(before, selectionBefore)
  }

  /**
   * 合并 view `range`。view→raw 翻译失败（非连续）、单格或与现存合并重叠（`MergeStore.merge`
   * 拒绝）时返回 false；成功则选中整块、入栈 merge 命令并返回 true。`range` 须已归一化。
   */
  mergeCells(range: CellRange): boolean {
    const rawRange = this.ctx.translateRange(range)
    if (!rawRange) return false
    const selectionBefore = this.ctx.getSelection()
    const before = this.mergeStore.snapshot()
    const region = this.mergeStore.merge(rawRange)
    if (!region) return false
    this.ctx.selectRange(range)
    const after = this.mergeStore.snapshot()
    const selectionAfter = this.ctx.getSelection()
    this.ctx.pushUndo({ kind: 'merge', before, after, selectionBefore, selectionAfter })
    return true
  }

  /** 取消 view `range` 触及的所有合并区域；移除任意区域则入栈 unmerge 命令返回 true。 */
  unmergeCells(range: CellRange): boolean {
    const rawRange = this.ctx.translateRange(range)
    if (!rawRange) return false
    const selectionBefore = this.ctx.getSelection()
    const before = this.mergeStore.snapshot()
    const removed = this.mergeStore.unmerge(rawRange)
    if (removed.length === 0) return false
    const after = this.mergeStore.snapshot()
    const selectionAfter = this.ctx.getSelection()
    this.ctx.pushUndo({ kind: 'unmerge', before, after, selectionBefore, selectionAfter })
    return true
  }

  /** 快照前后一致说明 store 未变动（无副作用），返回 false；否则入栈 format 命令返回 true。 */
  private commitFormatChange(before: readonly FormatLayer[], selectionBefore: GridSelection): boolean {
    const after = this.formatStore.snapshot()
    if (sameFormatLayers(before, after)) return false
    const selectionAfter = this.ctx.getSelection()
    this.ctx.pushUndo({ kind: 'format', before, after, selectionBefore, selectionAfter })
    return true
  }
}

function sameFormatLayers(a: readonly FormatLayer[], b: readonly FormatLayer[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false
  }
  return true
}
