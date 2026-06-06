/**
 * Phase 3.5 — 编辑会话状态（core 纯逻辑，DOM 在 web 层）。
 */

import type { FieldType } from '../kernel/data/Schema'
import type { CellAddress } from '../features/selection/SelectionTypes'

export interface CellEditSession {
  readonly cell: CellAddress
  readonly fieldId: string
  readonly fieldType: FieldType
  readonly draft: string
}

export class CellEditModel {
  private session: CellEditSession | null = null

  isEditing(): boolean {
    return this.session !== null
  }

  getSession(): CellEditSession | null {
    return this.session
  }

  begin(cell: CellAddress, fieldId: string, fieldType: FieldType, draft: string): void {
    this.session = { cell, fieldId, fieldType, draft }
  }

  setDraft(draft: string): void {
    if (!this.session) return
    this.session = { ...this.session, draft }
  }

  clear(): void {
    this.session = null
  }
}
