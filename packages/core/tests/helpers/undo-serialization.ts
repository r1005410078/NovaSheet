import { expect } from 'bun:test'
import type { UndoCommand } from '../../src/undo/UndoCommand'

/**
 * JSON round-trip 守卫：断言命令可安全序列化/反序列化而不丢失数据。
 * 仅适用于值域为纯 JSON（string/number/boolean/null/array/object）的命令。
 * 若 CellValue 包含 Date 实例，round-trip 会返回字符串 → 本 helper 会失败，
 * 应在调用处排除 Date 样例或归一化后再断言。
 */
export function assertSerializable(cmd: UndoCommand): void {
  expect(JSON.parse(JSON.stringify(cmd))).toEqual(cmd)
}
