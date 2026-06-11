import { useRef, useState } from 'react'

import { hsvaToCss, parseColor, type Hsva } from '../lib/color-convert'

const FALLBACK: Hsva = { h: 0, s: 0, v: 0, a: 1 }
export const CHECKERBOARD_BG = 'repeating-conic-gradient(#e2e8f0 0% 25%, #ffffff 0% 50%)'

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n))
}

/**
 * 自定义取色面板：SV 方块 + 色相/透明度滑条 + hex 输入 + 确定/取消。
 * 受控边界：HSVA 为内部规范状态；hex 输入仅在解析成功时回写状态，非法值标红不应用。
 * 确定回传 hsvaToCss 序列化结果（a=1 → 6 位 hex，否则 8 位）。
 */
export function CustomColorPicker({
  initialColor,
  onConfirm,
  onCancel,
}: {
  readonly initialColor: string
  readonly onConfirm: (color: string) => void
  readonly onCancel: () => void
}): JSX.Element {
  const [hsva, setHsva] = useState<Hsva>(() => parseColor(initialColor) ?? FALLBACK)
  const [hexInput, setHexInput] = useState<string>(() =>
    hsvaToCss(parseColor(initialColor) ?? FALLBACK),
  )
  const [hexInvalid, setHexInvalid] = useState(false)
  const svRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef(false)

  const applyHsva = (next: Hsva): void => {
    setHsva(next)
    setHexInput(hsvaToCss(next))
    setHexInvalid(false)
  }

  const pickFromPointer = (clientX: number, clientY: number): void => {
    const el = svRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return
    applyHsva({
      ...hsva,
      s: clamp01((clientX - rect.left) / rect.width),
      v: 1 - clamp01((clientY - rect.top) / rect.height),
    })
  }

  const currentCss = hsvaToCss(hsva)
  const opaqueCss = hsvaToCss({ ...hsva, a: 1 })

  return (
    <div data-novasheet-color-picker="" className="flex flex-col gap-2">
      <div
        ref={svRef}
        data-novasheet-color-picker-sv=""
        role="presentation"
        className="h-30 w-full cursor-crosshair rounded"
        style={{
          background: `linear-gradient(to top, #000000, transparent), linear-gradient(to right, #ffffff, hsl(${hsva.h} 100% 50%))`,
          touchAction: 'none',
        }}
        onPointerDown={(e) => {
          draggingRef.current = true
          e.currentTarget.setPointerCapture?.(e.pointerId)
          pickFromPointer(e.clientX, e.clientY)
        }}
        onPointerMove={(e) => {
          if (draggingRef.current) pickFromPointer(e.clientX, e.clientY)
        }}
        onPointerUp={() => {
          draggingRef.current = false
        }}
      />

      <label className="flex items-center gap-2">
        <span className="w-10 shrink-0 text-slate-700">色相</span>
        <input
          type="range"
          aria-label="色相"
          min={0}
          max={360}
          step={1}
          value={Math.round(hsva.h)}
          className="h-2 w-full"
          style={{
            background:
              'linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)',
          }}
          onChange={(e) => applyHsva({ ...hsva, h: Number(e.target.value) })}
        />
      </label>

      <label className="flex items-center gap-2">
        <span className="w-10 shrink-0 text-slate-700">透明度</span>
        <span
          className="relative h-2 w-full rounded"
          style={{ backgroundImage: CHECKERBOARD_BG, backgroundSize: '8px 8px' }}
        >
          <input
            type="range"
            aria-label="透明度"
            min={0}
            max={100}
            step={1}
            value={Math.round(hsva.a * 100)}
            className="absolute inset-0 h-2 w-full"
            style={{ backgroundImage: `linear-gradient(to right, transparent, ${opaqueCss})` }}
            onChange={(e) => applyHsva({ ...hsva, a: Number(e.target.value) / 100 })}
          />
        </span>
      </label>

      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className="inline-block size-6 shrink-0 rounded-full border border-slate-300"
          style={{
            backgroundImage: `linear-gradient(${currentCss}, ${currentCss}), ${CHECKERBOARD_BG}`,
            backgroundSize: 'auto, 8px 8px',
          }}
        />
        <input
          type="text"
          aria-label="十六进制颜色"
          aria-invalid={hexInvalid ? 'true' : undefined}
          value={hexInput}
          spellCheck={false}
          className={`h-7 w-full rounded border px-2 font-mono text-[12px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 ${
            hexInvalid ? 'border-red-500' : 'border-slate-300'
          }`}
          onChange={(e) => {
            const raw = e.target.value
            setHexInput(raw)
            const parsed = parseColor(raw)
            if (parsed) {
              setHsva(parsed)
              setHexInvalid(false)
            } else {
              setHexInvalid(true)
            }
          }}
        />
      </div>

      <div className="flex justify-end gap-2">
        <button
          type="button"
          data-novasheet-color-picker-cancel=""
          className="h-7 rounded px-3 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
          onClick={onCancel}
        >
          取消
        </button>
        <button
          type="button"
          data-novasheet-color-picker-confirm=""
          className="h-7 rounded bg-slate-800 px-3 text-white hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
          onClick={() => onConfirm(hsvaToCss(hsva))}
        >
          确定
        </button>
      </div>
    </div>
  )
}
