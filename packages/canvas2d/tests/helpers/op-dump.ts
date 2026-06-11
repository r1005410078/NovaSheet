import type { RecordedOp } from './recording-context'

/**
 * RecordedOp 序列 → 确定性文本（黄金文件用）。
 *
 * save/restore 用缩进体现 ctx 状态栈深度，clip 范围与 painter 边界一眼可读；
 * 字符串参数 JSON 引号包裹，避免文本内逗号与参数分隔符混淆。
 * RecordingContext 的 measureText 恒定 7px/char，整条 op 流确定性可入金。
 */
export function dumpOps(ops: readonly RecordedOp[]): string {
  const lines: string[] = []
  let depth = 0
  for (const op of ops) {
    if (op.op === 'restore') depth = Math.max(0, depth - 1)
    lines.push(`${'  '.repeat(depth)}${opLine(op)}`)
    if (op.op === 'save') depth += 1
  }
  return `${lines.join('\n')}\n`
}

function fmtArg(arg: unknown): string {
  if (typeof arg === 'string') return JSON.stringify(arg)
  if (Array.isArray(arg)) return JSON.stringify(arg)
  return String(arg)
}

function opLine(op: RecordedOp): string {
  if ('args' in op) return `${op.op}(${op.args.map(fmtArg).join(', ')})`
  if ('value' in op) return `${op.op} = ${String(op.value)}`
  return op.op
}
