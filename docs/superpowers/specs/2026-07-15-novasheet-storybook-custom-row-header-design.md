# NovaSheet Storybook 自定义行头案例设计

- **日期**：2026-07-15
- **状态**：设计
- **范围**：`apps/storybook` 的 `NovaExcel` 示例与渲染测试

## 1. 目标

为已发布的 `rowHeaderField` API 增加一个独立 Storybook 案例。案例使用带有
`deviceCode`、`name` 和 `status` 的行数据，将 `deviceCode` 作为 Excel 最左侧行头，
同时仅把 `name`、`status` 放入正文 schema。

用户能从画面直接确认：设备编码显示在左侧行头，正文列不重复显示该字段。

## 2. 方案

在 `apps/storybook/src/stories/NovaExcel.stories.ts` 增加一个 `CustomRowHeader` story：

```tsx
<NovaExcel
  data={data}
  excelWorkspace={false}
  rowHeaderField="deviceCode"
  showToolbar={false}
/>
```

案例沿用当前 React host、全屏布局和 `docsStory` 文档模式。数据源使用
`InMemoryDataSource`，schema 只定义 `name`、`status`，行对象携带不在 schema 内的
`deviceCode` 附加字段。

## 3. Storybook React root 生命周期

`@storybook/html` 的 `renderToCanvas` 会直接清空 `canvasElement.innerHTML`，不会自动卸载
嵌入其中的 React root。`NovaExcel` story host 必须带专用 data attribute，并保存对应的
React root 引用；不得由各 story 自行约定属性名或清理方式。

`apps/storybook/.storybook/preview.tsx` 的全局 `beforeEach` 必须返回 cleanup 回调。在
Storybook renderer 清空 DOM 前，该回调从 `context.canvasElement` 中查找所有带标记的 host
并逐一卸载其 React root。`NovaExcelOutOfTheBox` 和 `CustomRowHeader` 必须经同一 helper
创建 host、注册标记和 root 引用，保证两个 story 都走相同的卸载路径。

## 4. 测试

在 `NovaExcel.stories.test.ts` 先增加失败测试，验证新 story：

1. 可挂载 `NovaExcel` 和 canvas；
2. 获取到 story 私有的数据源时，正文 schema 不含 `deviceCode`；
3. 第一行数据的 `deviceCode` 为 `设备-001`。
4. 通过 `RecordingContext2D` 检查 canvas `fillText` 操作包含 `设备-001`，锁定
   `rowHeaderField="deviceCode"` 的实际绘制路径。

这里同时锁定示例配置、示例数据和行头 Canvas 输出，防止演示退化成普通序号行头。

另加生命周期回归测试：模拟 Storybook `canvasElement` 包含已挂载的 `NovaExcel` story host，
调用全局 cleanup 所依赖的 helper 后，断言 host 内的 Grid 和 canvas 均已移除。该测试锁定
React root 会在 HTML renderer 清空 DOM 之前卸载。

## 5. 非目标

- 不增加新的组件 prop、主题或自动行头宽度。
- 不把示例纳入 Excel Scenario Board；它是 API 展示，而非 MBD 场景。
- 不复用或改动现有 `NovaExcelOutOfTheBox` 的稀疏工作区案例。

## 6. 验收

`CustomRowHeader` 可在 Storybook 中显示设备编码行头，且 Storybook 渲染测试、React
typecheck 和相关 lint 均通过。Storybook 切换或重渲染前，所有带标记的 `NovaExcel` React
root 均经全局 `beforeEach` cleanup 卸载，不遗留 Grid 或 canvas。
