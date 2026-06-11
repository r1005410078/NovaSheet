# rendering

视觉 / 渲染回归域：RenderFrame 黄金快照测试。

- 机制：`_helpers/frame-dump.ts` 把 frame 序列化为确定性文本，`_helpers/golden.ts` 与 `__goldens__/<scenario-id>.golden.txt` 逐字符比对。
- 更新：`GOLDEN_UPDATE=1 bun test packages/core/tests/acceptance/rendering` 重生成 → **git diff review** → 提交。禁止盲更掩盖回归。
- 快照只读 frame 契约（viewport snapshot + data + formatCell + cellFormats + mergeRegions），与渲染后端同一访问面。
