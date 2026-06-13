/** 扩展注册的 per-cell 附件 namespace + 序列化器（clipboard / 持久化用）。core 不识别 T 的语义。 */
export interface CellAttachmentCodec<T> {
  readonly namespace: string
  serialize(data: T): string
  deserialize(text: string): T | undefined
}

/** 单个 raw cell 上的全部 namespace 附件（namespace → opaque data）。 */
export type CellAttachmentMap = ReadonlyMap<string, unknown>

/** 整个附件存储的可序列化快照（供 undo restore）。 */
export interface CellAttachmentEntry {
  readonly row: number
  readonly col: number
  readonly namespace: string
  readonly data: unknown
}
export type CellAttachmentSnapshot = readonly CellAttachmentEntry[]
