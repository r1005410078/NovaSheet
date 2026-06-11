# NovaSheet 工具栏调色板自定义区改造 — 设计

- **日期**：2026-06-11
- **状态**：已批准
- **分支**：`refactor-default-grid-engine-decomposition`
- **前置**：canvas2d 半透明 fill under-line pass 已 ship（fill alpha 可见下层格线）
- **相关**：
  - `docs/superpowers/specs/2026-06-10-novasheet-bdd-tdd-method-design.md`（方法论）
  - `packages/react/docs/project-standards.md`

---

## 1. 背景与目标

`ToolbarColorPalette` 的「自定义」区是 stub：「+」写死回传 `#fff2cc`、吸管写死 `#000000`、「标准」行旁还有一个 stray 吸管 stub。色板全部是不透明 6 位 hex，而引擎刚支持了半透明 fill（rgba/8 位 hex 下层格线隐约可见），UI 上无任何入口可达。

### 成功标准

| 维度 | 目标 |
| --- | --- |
| 自定义取色器 | 手写 HSV + alpha 面板，hex 输入支持 8 位，确定后应用并存为 swatch |
| 吸管 | `window.EyeDropper` feature-detect：支持则显示并取屏幕色直接应用，否则不渲染 |
| 自定义 swatch | localStorage `novasheet:custom-colors` 持久化，FIFO 上限 16、去重 |
| 覆盖入口 | fill picker 与 border picker 都接入自定义区；stray 吸管删除 |
| BDD | 新增 L3 场景约 3 条；`mbd validate`/manifest 过；`lint:scenario-coverage` 不退化 |

### 非目标

- 条件格式 / 交替颜色（Phase 5-D 范围）
- 最近使用颜色（recent colors）
- 文字颜色按钮（工具栏尚无该入口）
- 引入第三方取色器依赖

---

## 2. 方案

### 2.1 新增单元（`packages/react/src/features/toolbar/`）

| 单元 | 职责 | 依赖 |
| --- | --- | --- |
| `lib/color-convert.ts` | 纯函数：解析 `#RGB/#RRGGBB/#RRGGBBAA/rgba()` ↔ HSV(A) ↔ 序列化。输出规则：alpha=1 → `#rrggbb`，alpha<1 → `#rrggbbaa`。无 DOM | — |
| `lib/use-custom-colors.ts` | `useCustomColors(): { colors, add }`。localStorage 读写；storage 抛错或 JSON 损坏时静默回退纯内存 state；FIFO 上限 16、按规范化小写去重 | color-convert |
| `components/CustomColorPicker.tsx` | 取色面板：饱和度/明度方块（CSS gradient + pointer capture drag）、色相条、alpha 条（棋盘格底）、hex 输入框、新旧色对比预览、确定/取消按钮 | color-convert |

### 2.2 `ColorPalette.tsx` 改造

- `ToolbarColorPaletteCustom` props 变为 `{ onSelect, onOpenPicker, customColors }`（swatch 数据与新增动作由宿主经 `useCustomColors` 提供，组件本身无 IO）：
  - 已存 swatch 行：复用 `ColorSwatch`，半透明色加棋盘格 underlay（CSS conic-gradient）。
  - 「+」：通知宿主 popover 切换到 picker 视图（受控 `onOpenPicker` 回调，不开嵌套 popover）。
  - 吸管：feature-detect；`EyeDropper.open()` 结果直接 `onSelect`（不存 swatch，与 Sheets 一致）；promise reject（用户 Esc）静默忽略。
- `ToolbarColorPalette`：删除「标准」行旁 stray 吸管按钮。
- `ColorSwatch`：选中比较前先经 color-convert 规范化（现为裸 `toLowerCase` 比较，`#FFF2CC` vs `#fff2cc` 之外的等价形式无法命中）。

### 2.3 picker 视图切换（fill 与 border 共用）

`FillColorPalette`（NovaSheetToolbar 内）与 `BorderPalette` 的 color 子面板各自持 `view: 'palette' | 'picker'` state：

- `palette` 视图 = 现有内容 + 自定义区；
- 「+」→ `picker` 视图，面板内容整体替换为 `CustomColorPicker`（初始色 = 当前 `selectedColor`，无则 `#000000`）；
- 确定 → `onSelect(color)` + `add(color)`，随后走各入口既有的选色收尾（fill 关闭 popover；border `reapplyWithDraft` 并收起 color 子面板）；取消 → 返回 `palette` 视图；
- 两入口共享同一份 localStorage swatch。

### 2.4 错误处理

| 场景 | 行为 |
| --- | --- |
| hex 输入非法 | 输入框红框提示，不应用、不改面板状态 |
| localStorage 不可用 / quota | try/catch 回退内存，功能不缺失、仅不持久 |
| `EyeDropper.open()` reject | 静默忽略（用户取消） |
| SSR / 无 window | hook 惰性初始化，首帧空数组 |

---

## 3. 测试

### 内环（TDD 单测，`packages/react/tests/features/toolbar/`）

- color-convert：解析/序列化往返、非法输入返回 undefined、HSV 边界（黑/白/灰 hue 退化）。
- use-custom-colors：持久化往返、FIFO 截断、去重、storage 抛错回退。
- CustomColorPicker：pointer 拖拽改色、hex 输入合法/非法、确定/取消回调。
- ToolbarColorPaletteCustom：swatch 渲染、EyeDropper stub（`tests/helpers/global-stub`）存在/缺失两分支。

### 外环（BDD 场景，`packages/react/tests/excel/scenarios/`）

| 场景 id | G/W/T 摘要 |
| --- | --- |
| `excel.L3b.custom-fill-color` | 选区 → 自定义取色器选半透明色确定 → `setRangeFormat` 收到 8 位 hex，toolbar 状态更新 |
| `excel.L3c.custom-color-persist` | 添加自定义色 → 卸载重挂 → swatch 仍在 |
| `excel.L3c.eyedropper-feature-detect` | 无 `window.EyeDropper` → 吸管按钮不渲染 |

`mbd validate` + `manifest` 通过；`lint:scenario-coverage` 不退化。

---

## 4. 验收清单

1. fill / border 两入口可打开取色器，选半透明色应用后画布可见 alpha 填充与隐约格线。
2. 自定义 swatch 刷新页面后留存；超 16 个 FIFO 淘汰。
3. Chrome 显示吸管且可取色；happy-dom（无 EyeDropper）不渲染吸管。
4. `bun test`、`bun run --filter '@novasheet/react' typecheck`、`bun run lint` 全绿（既有 storybook typecheck 债除外）。
5. storybook 工具栏 story 可手动验证完整流程。
