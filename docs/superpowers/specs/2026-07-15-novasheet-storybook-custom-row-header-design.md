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

## 3. 测试

在 `NovaExcel.stories.test.ts` 先增加失败测试，验证新 story：

1. 可挂载 `NovaExcel` 和 canvas；
2. 获取到 story 私有的数据源时，正文 schema 不含 `deviceCode`；
3. 第一行数据的 `deviceCode` 为 `设备-001`。
4. 通过 `RecordingContext2D` 检查 canvas `fillText` 操作包含 `设备-001`，锁定
   `rowHeaderField="deviceCode"` 的实际绘制路径。

这里同时锁定示例配置、示例数据和行头 Canvas 输出，防止演示退化成普通序号行头。

## 4. 非目标

- 不增加新的组件 prop、主题或自动行头宽度。
- 不把示例纳入 Excel Scenario Board；它是 API 展示，而非 MBD 场景。
- 不复用或改动现有 `NovaExcelOutOfTheBox` 的稀疏工作区案例。

## 5. 验收

`CustomRowHeader` 可在 Storybook 中显示设备编码行头，且 Storybook 渲染测试、React
typecheck 和相关 lint 均通过。
