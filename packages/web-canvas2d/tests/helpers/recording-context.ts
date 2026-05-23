export type RecordedOp =
  | { op: 'save' }
  | { op: 'restore' }
  | { op: 'beginPath' }
  | { op: 'clip' }
  | { op: 'rect'; args: [number, number, number, number] }
  | { op: 'fillRect'; args: [number, number, number, number] }
  | { op: 'clearRect'; args: [number, number, number, number] }
  | { op: 'fillText'; args: [string, number, number, number?] }
  | { op: 'strokeText'; args: [string, number, number, number?] }
  | { op: 'moveTo'; args: [number, number] }
  | { op: 'lineTo'; args: [number, number] }
  | { op: 'stroke' }
  | { op: 'strokePath' }
  | { op: 'fill' }
  | { op: 'fillPath' }
  | { op: 'translate'; args: [number, number] }
  | { op: 'scale'; args: [number, number] }
  | { op: 'setTransform'; args: [number, number, number, number, number, number] }
  | { op: 'set:fillStyle'; value: string | CanvasGradient | CanvasPattern }
  | { op: 'set:strokeStyle'; value: string | CanvasGradient | CanvasPattern }
  | { op: 'set:font'; value: string }
  | { op: 'set:textBaseline'; value: CanvasTextBaseline }
  | { op: 'set:textAlign'; value: CanvasTextAlign }
  | { op: 'set:lineWidth'; value: number }
  | { op: 'set:lineCap'; value: CanvasLineCap }

const CHAR_WIDTH = 7 // deterministic default for measureText

export function createRecordingContext(
  width = 800,
  height = 600,
): {
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
  ops: RecordedOp[]
} {
  const ops: RecordedOp[] = []
  const canvas = { width, height, style: {} } as unknown as HTMLCanvasElement

  let _fillStyle: string | CanvasGradient | CanvasPattern = '#000'
  let _strokeStyle: string | CanvasGradient | CanvasPattern = '#000'
  let _font = '10px sans-serif'
  let _textBaseline: CanvasTextBaseline = 'alphabetic'
  let _textAlign: CanvasTextAlign = 'left'
  let _lineWidth = 1
  let _lineCap: CanvasLineCap = 'butt'

  const ctx = {
    canvas,
    get fillStyle() {
      return _fillStyle
    },
    set fillStyle(v) {
      _fillStyle = v
      ops.push({ op: 'set:fillStyle', value: v })
    },
    get strokeStyle() {
      return _strokeStyle
    },
    set strokeStyle(v) {
      _strokeStyle = v
      ops.push({ op: 'set:strokeStyle', value: v })
    },
    get font() {
      return _font
    },
    set font(v) {
      _font = v
      ops.push({ op: 'set:font', value: v })
    },
    get textBaseline() {
      return _textBaseline
    },
    set textBaseline(v) {
      _textBaseline = v
      ops.push({ op: 'set:textBaseline', value: v })
    },
    get textAlign() {
      return _textAlign
    },
    set textAlign(v) {
      _textAlign = v
      ops.push({ op: 'set:textAlign', value: v })
    },
    get lineWidth() {
      return _lineWidth
    },
    set lineWidth(v) {
      _lineWidth = v
      ops.push({ op: 'set:lineWidth', value: v })
    },
    get lineCap() {
      return _lineCap
    },
    set lineCap(v) {
      _lineCap = v
      ops.push({ op: 'set:lineCap', value: v })
    },

    save() {
      ops.push({ op: 'save' })
    },
    restore() {
      ops.push({ op: 'restore' })
    },
    beginPath() {
      ops.push({ op: 'beginPath' })
    },
    clip() {
      ops.push({ op: 'clip' })
    },
    rect(x: number, y: number, w: number, h: number) {
      ops.push({ op: 'rect', args: [x, y, w, h] })
    },
    fillRect(x: number, y: number, w: number, h: number) {
      ops.push({ op: 'fillRect', args: [x, y, w, h] })
    },
    clearRect(x: number, y: number, w: number, h: number) {
      ops.push({ op: 'clearRect', args: [x, y, w, h] })
    },
    fillText(text: string, x: number, y: number, maxWidth?: number) {
      ops.push({
        op: 'fillText',
        args: maxWidth === undefined ? [text, x, y] : [text, x, y, maxWidth],
      })
    },
    strokeText(text: string, x: number, y: number, maxWidth?: number) {
      ops.push({
        op: 'strokeText',
        args: maxWidth === undefined ? [text, x, y] : [text, x, y, maxWidth],
      })
    },
    moveTo(x: number, y: number) {
      ops.push({ op: 'moveTo', args: [x, y] })
    },
    lineTo(x: number, y: number) {
      ops.push({ op: 'lineTo', args: [x, y] })
    },
    stroke(path?: Path2D) {
      if (path) ops.push({ op: 'strokePath' })
      else ops.push({ op: 'stroke' })
    },
    fill(path?: Path2D) {
      if (path) ops.push({ op: 'fillPath' })
      else ops.push({ op: 'fill' })
    },
    translate(x: number, y: number) {
      ops.push({ op: 'translate', args: [x, y] })
    },
    scale(x: number, y: number) {
      ops.push({ op: 'scale', args: [x, y] })
    },
    setTransform(a: number, b: number, c: number, d: number, e: number, f: number) {
      ops.push({ op: 'setTransform', args: [a, b, c, d, e, f] })
    },
    measureText(s: string): TextMetrics {
      return { width: s.length * CHAR_WIDTH } as TextMetrics
    },
    createLinearGradient(): CanvasGradient {
      return { addColorStop: () => {} } as unknown as CanvasGradient
    },
  } as unknown as CanvasRenderingContext2D

  return { canvas, ctx, ops }
}
