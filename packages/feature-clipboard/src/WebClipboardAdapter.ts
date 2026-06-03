/**
 * Phase 4.1 — `navigator.clipboard` 的薄封装。
 *
 * 失败（API 不存在 / 权限拒绝 / Safari 沙盒）一律不抛错：
 *   - `writeText` 失败 → 返回 false（上层可静默 fallback 到内部缓存）
 *   - `readText` 失败 → 返回 null（上层视为剪贴板为空）
 */

interface MinimalClipboard {
  writeText?: (text: string) => Promise<void>
  readText?: () => Promise<string>
}

interface MinimalNavigator {
  clipboard?: MinimalClipboard
}

export class WebClipboardAdapter {
  async writeText(text: string): Promise<boolean> {
    const cb = (globalThis as { navigator?: MinimalNavigator }).navigator?.clipboard
    if (!cb || typeof cb.writeText !== 'function') return false
    try {
      await cb.writeText(text)
      return true
    } catch {
      return false
    }
  }

  async readText(): Promise<string | null> {
    const cb = (globalThis as { navigator?: MinimalNavigator }).navigator?.clipboard
    if (!cb || typeof cb.readText !== 'function') return null
    try {
      return await cb.readText()
    } catch {
      return null
    }
  }
}
