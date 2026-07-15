# NovaSheet Storybook 自定义行头案例 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 NovaExcel Storybook 中展示 `rowHeaderField` 使用数据行的 `deviceCode` 作为左侧行头。

**Architecture:** 复用现有 `NovaExcel` React story host；新增独立 `CustomRowHeader` story，使用 `InMemoryDataSource` 的行附加字段存储设备编码，正文 schema 不包含该字段。Storybook 渲染测试通过 story host 暴露的数据源检查示例配置，并以 `RecordingContext2D` 断言 Canvas 实际绘制 `设备-001`。

**Tech Stack:** TypeScript、React 18、`@storybook/html`、`@novasheet/core`、`@novasheet/react`、`bun:test`

---

## 文件结构

| 文件 | 责任 |
| --- | --- |
| `apps/storybook/src/stories/NovaExcel.stories.ts` | 新增数据构造器与 `CustomRowHeader` Storybook 案例 |
| `apps/storybook/src/stories/NovaExcel.stories.test.ts` | 覆盖新案例的组件挂载、数据与正文 schema |

### Task 1: 新增 Storybook 渲染回归测试

**Files:**
- Modify: `apps/storybook/src/stories/NovaExcel.stories.test.ts`

- [ ] **Step 1: 写入失败测试与导入**

把 story import 改为：

```ts
import { createRecordingContext } from '../../../../packages/canvas2d/tests/helpers/recording-context'
import { CustomRowHeader, NovaExcelOutOfTheBox } from './NovaExcel.stories'
```

在现有测试后新增：

```ts
it('renders NovaExcel with device codes as custom row headers', async () => {
  const originalGetContext = HTMLCanvasElement.prototype.getContext
  const originalRequestAnimationFrame = globalThis.requestAnimationFrame
  const rafQueue: FrameRequestCallback[] = []
  const recordings: Array<{
    readonly canvas: HTMLCanvasElement
    readonly recording: ReturnType<typeof createRecordingContext>
  }> = []
  let host: (HTMLElement & {
    __customRowHeaderData: {
      getCell(rowIndex: number, fieldId: string): unknown
      getSchema(): { fields: readonly { id: string }[] }
    }
    __reactRoot: { unmount(): void }
  }) | undefined

  try {
    globalThis.requestAnimationFrame = (callback: FrameRequestCallback) => {
      rafQueue.push(callback)
      return rafQueue.length
    }
    HTMLCanvasElement.prototype.getContext = function getContext(
      this: HTMLCanvasElement,
      type: string,
    ) {
      if (type !== '2d') return null
      const recording = createRecordingContext(this.width || 800, this.height || 600)
      recordings.push({ canvas: this, recording })
      return recording.ctx as never
    } as never

    const render = CustomRowHeader.render
    expect(render).toBeDefined()
    const renderedHost = (await renderStoryHost(() => {
      const storyHost = render!({}, {} as never) as Exclude<typeof host, undefined>
      host = storyHost
      return storyHost
    })) as Exclude<typeof host, undefined>

    while (rafQueue.length > 0) {
      const callbacks = rafQueue.splice(0)
      for (const callback of callbacks) callback(performance.now())
    }

    expect(renderedHost.querySelector('[data-novasheet-react-excel]')).not.toBeNull()
    const gridRoot = renderedHost.querySelector('[data-novasheet-react-grid]')
    expect(gridRoot).not.toBeNull()
    const canvas = gridRoot!.querySelector<HTMLCanvasElement>('canvas')
    expect(canvas).not.toBeNull()
    expect(renderedHost.__customRowHeaderData.getCell(0, 'deviceCode')).toBe('设备-001')
    expect(renderedHost.__customRowHeaderData.getSchema().fields.map((field) => field.id)).toEqual([
      'name',
      'status',
    ])

    const visibleRecording = recordings.find((entry) => entry.canvas === canvas)?.recording
    expect(visibleRecording).toBeDefined()
    const texts = visibleRecording!.ops
      .filter((op) => op.op === 'fillText')
      .map((op) => (op.op === 'fillText' ? op.args[0] : ''))
    expect(texts).toContain('设备-001')
  } finally {
    try {
      try {
        if (host) unmountReactRoot(host.__reactRoot)
      } finally {
        HTMLCanvasElement.prototype.getContext = originalGetContext
      }
    } finally {
      globalThis.requestAnimationFrame = originalRequestAnimationFrame
    }
  }
})
```

- [ ] **Step 2: 运行测试确认 RED**

Run:

```bash
bun test apps/storybook/src/stories/NovaExcel.stories.test.ts
```

Expected: FAIL，报错 `CustomRowHeader` 未导出，证明测试覆盖的是尚不存在的 story。

- [ ] **Step 3: 提交失败测试**

```bash
git add apps/storybook/src/stories/NovaExcel.stories.test.ts
git commit -m "test(storybook): 定义自定义行头案例"
```

### Task 2: 实现 CustomRowHeader Storybook 案例

**Files:**
- Modify: `apps/storybook/src/stories/NovaExcel.stories.ts`
- Modify: `apps/storybook/src/stories/NovaExcel.stories.test.ts`

- [ ] **Step 1: 导入 InMemoryDataSource**

将 Core import 从：

```ts
import { SparseExcelDataSource } from '@novasheet/core'
```

改为：

```ts
import { InMemoryDataSource, SparseExcelDataSource } from '@novasheet/core'
```

- [ ] **Step 2: 增加设备数据构造器**

在 `createDemoData()` 后加入：

```ts
function createCustomRowHeaderData(): InMemoryDataSource {
  return new InMemoryDataSource({
    schema: {
      fields: [
        { id: 'name', name: '名称', type: 'text', width: 180 },
        { id: 'status', name: '状态', type: 'text', width: 120 },
      ],
    },
    rows: [
      { deviceCode: '设备-001', name: '电池组 A', status: '运行' },
      { deviceCode: '设备-002', name: '电池组 B', status: '待机' },
      { deviceCode: '设备-003', name: '电池组 C', status: '停止' },
    ],
  })
}
```

- [ ] **Step 3: 增加 Storybook story**

在 `NovaExcelOutOfTheBox` 后加入：

```ts
export const CustomRowHeader: Story = {
  name: 'Custom row header',
  ...docsStory(
    `<NovaExcel data={data} excelWorkspace={false} rowHeaderField="deviceCode" showToolbar={false} />`,
    'Uses each row data object\'s deviceCode as the Excel row header. The deviceCode field remains outside the body schema.',
  ),
  render: () => {
    const data = createCustomRowHeaderData()
    const host = document.createElement('div')
    host.style.width = '100%'
    host.style.height = '100vh'
    host.style.minHeight = '560px'

    const root = createRoot(host)
    ;(host as unknown as HTMLElement & { __reactRoot: typeof root }).__reactRoot = root
    ;(host as unknown as HTMLElement & { __customRowHeaderData: InMemoryDataSource }).__customRowHeaderData =
      data
    flushSync(() => {
      root.render(
        React.createElement(NovaExcel, {
          data,
          excelWorkspace: false,
          rowHeaderField: 'deviceCode',
          showToolbar: false,
          className: 'h-full w-full',
        }),
      )
    })

    return host
  },
}
```

- [ ] **Step 4: 保留 Canvas 录制测试配置与清理**

实现转绿时，测试须保留以下完整代码，而非简化为只检查 host 数据。它与 Task 1 的
RED 测试使用相同的 `createRecordingContext`、`requestAnimationFrame` 队列、`getContext`
替换、`fillText` 断言和 `finally` 清理：

```ts
it('renders NovaExcel with device codes as custom row headers', async () => {
  const originalGetContext = HTMLCanvasElement.prototype.getContext
  const originalRequestAnimationFrame = globalThis.requestAnimationFrame
  const rafQueue: FrameRequestCallback[] = []
  const recordings: Array<{
    readonly canvas: HTMLCanvasElement
    readonly recording: ReturnType<typeof createRecordingContext>
  }> = []
  let host: (HTMLElement & {
    __customRowHeaderData: {
      getCell(rowIndex: number, fieldId: string): unknown
      getSchema(): { fields: readonly { id: string }[] }
    }
    __reactRoot: { unmount(): void }
  }) | undefined

  try {
    globalThis.requestAnimationFrame = (callback: FrameRequestCallback) => {
      rafQueue.push(callback)
      return rafQueue.length
    }
    HTMLCanvasElement.prototype.getContext = function getContext(
      this: HTMLCanvasElement,
      type: string,
    ) {
      if (type !== '2d') return null
      const recording = createRecordingContext(this.width || 800, this.height || 600)
      recordings.push({ canvas: this, recording })
      return recording.ctx as never
    } as never

    const render = CustomRowHeader.render
    expect(render).toBeDefined()
    const renderedHost = (await renderStoryHost(() => {
      const storyHost = render!({}, {} as never) as Exclude<typeof host, undefined>
      host = storyHost
      return storyHost
    })) as Exclude<typeof host, undefined>

    while (rafQueue.length > 0) {
      const callbacks = rafQueue.splice(0)
      for (const callback of callbacks) callback(performance.now())
    }

    expect(renderedHost.querySelector('[data-novasheet-react-excel]')).not.toBeNull()
    const gridRoot = renderedHost.querySelector('[data-novasheet-react-grid]')
    expect(gridRoot).not.toBeNull()
    const canvas = gridRoot!.querySelector<HTMLCanvasElement>('canvas')
    expect(canvas).not.toBeNull()
    expect(renderedHost.__customRowHeaderData.getCell(0, 'deviceCode')).toBe('设备-001')
    expect(renderedHost.__customRowHeaderData.getSchema().fields.map((field) => field.id)).toEqual([
      'name',
      'status',
    ])

    const visibleRecording = recordings.find((entry) => entry.canvas === canvas)?.recording
    expect(visibleRecording).toBeDefined()
    const texts = visibleRecording!.ops
      .filter((op) => op.op === 'fillText')
      .map((op) => (op.op === 'fillText' ? op.args[0] : ''))
    expect(texts).toContain('设备-001')
  } finally {
    try {
      try {
        if (host) unmountReactRoot(host.__reactRoot)
      } finally {
        HTMLCanvasElement.prototype.getContext = originalGetContext
      }
    } finally {
      globalThis.requestAnimationFrame = originalRequestAnimationFrame
    }
  }
})
```

- [ ] **Step 5: 运行定向测试确认 GREEN**

Run:

```bash
bun test apps/storybook/src/stories/NovaExcel.stories.test.ts
```

Expected: PASS，两个 story 测试均通过。

- [ ] **Step 6: 运行 Storybook 类型检查**

Run:

```bash
bun run --filter @novasheet/storybook typecheck
```

Expected: exit 0。

- [ ] **Step 7: 提交实现与 GREEN 测试**

```bash
git add apps/storybook/src/stories/NovaExcel.stories.ts apps/storybook/src/stories/NovaExcel.stories.test.ts
git commit -m "feat(storybook): 增加自定义行头案例"
```

### Task 3: 完整验证与审查

**Files:**
- Review only.

- [ ] **Step 1: 运行改动范围测试与 lint**

```bash
bun test apps/storybook/src/stories/NovaExcel.stories.test.ts packages/react/tests/excel/NovaExcel.test.ts
bun run lint
```

Expected: 测试 0 fail；lint 若仍出现既有 `BlockCache.test.ts` warning，单独报告且不修改范围外文件。

- [ ] **Step 2: 核对提交范围**

```bash
git diff --check HEAD~2..HEAD
git status --short
git log -2 --oneline
```

Expected: 仅包含本计划列出的 Storybook 测试、story 文件与本计划文档；主工作区既有未提交改动仍保持未暂存。

- [ ] **Step 3: 代码审查重点**

审查新案例是否：

```text
1. 使用 rowHeaderField="deviceCode" 而非把 deviceCode 放入 schema.fields；
2. 用 InMemoryDataSource 的行附加字段供行头读取；
3. 清理 React root，避免 story test 泄漏；
4. 未修改现有 SparseExcelDataSource 默认案例；
5. 没有引入生产 API 或视觉 token 变更。
```
