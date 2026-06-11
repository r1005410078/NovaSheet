import { useCallback, useState } from 'react'

import { normalizeColor } from './color-convert'

const STORAGE_KEY = 'novasheet:custom-colors'
const MAX_CUSTOM_COLORS = 16

function readStoredColors(): readonly string[] {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((entry): entry is string => typeof entry === 'string')
      .slice(0, MAX_CUSTOM_COLORS)
  } catch {
    return []
  }
}

function writeStoredColors(colors: readonly string[]): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(colors))
  } catch {
    // storage 不可用（quota/隐私模式）只丢持久化，会话内功能不受影响
  }
}

/**
 * 自定义颜色 swatch（localStorage 持久化，FIFO 上限 16、规范化去重）。
 * fill / border 两个 popover 各自实例化；popover 关闭即卸载，重开时重读 storage，
 * 因此无需跨实例同步。
 */
export function useCustomColors(): {
  readonly colors: readonly string[]
  readonly add: (color: string) => void
} {
  const [colors, setColors] = useState<readonly string[]>(readStoredColors)

  const add = useCallback((color: string) => {
    const normalized = normalizeColor(color) ?? color.trim().toLowerCase()
    setColors((prev) => {
      const next = [normalized, ...prev.filter((c) => c !== normalized)].slice(
        0,
        MAX_CUSTOM_COLORS,
      )
      writeStoredColors(next)
      return next
    })
  }, [])

  return { colors, add }
}
