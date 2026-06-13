/** 单 run 的样式覆盖；缺省字段 = 继承 cell 默认（theme typography）。 */
export interface TextRunAttrs {
  readonly bold?: boolean
  readonly italic?: boolean
  readonly underline?: boolean
  readonly strikethrough?: boolean
  readonly fontSize?: number
  readonly fontFamily?: string
  readonly color?: string
}

/** 半开 [start, end)，UTF-16 code-unit 偏移（对齐 contenteditable Selection）。 */
export interface TextRun {
  readonly start: number
  readonly end: number
  readonly attrs: TextRunAttrs
}

/** normalized：按 start 升序、互不重叠、相邻等格已合并；gap 继承 cell 默认。 */
export type RichTextValue = readonly TextRun[]
