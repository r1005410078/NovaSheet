import { useCallback, useState } from 'react'

import { deriveToolbarStateFromGrid, type ToolbarStateGridAccess } from './deriveToolbarState'
import type { NovaSheetToolbarState } from './types'

export interface UseNovaSheetToolbarStateResult {
  readonly toolbarState: NovaSheetToolbarState
  readonly canUndo: boolean
  readonly canRedo: boolean
  /** 从 Grid 重新读取选区格式并刷新工具栏状态。 */
  syncToolbarState: () => void
}

export function useNovaSheetToolbarState(
  getGrid: () => ToolbarStateGridAccess | null,
): UseNovaSheetToolbarStateResult {
  const [toolbarState, setToolbarState] = useState<NovaSheetToolbarState>({})
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)

  const syncToolbarState = useCallback(() => {
    const grid = getGrid()
    if (!grid) return
    setToolbarState(deriveToolbarStateFromGrid(grid))
    setCanUndo(grid.canUndo())
    setCanRedo(grid.canRedo())
  }, [getGrid])

  return { toolbarState, canUndo, canRedo, syncToolbarState }
}
