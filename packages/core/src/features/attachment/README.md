# attachment

语义无关的 per-cell 附件存储（`CellAttachmentStore`）。

- **键控**：raw 行/列索引，与 `RangeStyleStore`/`MergeStore` 一致。
- **结构 remap**：`FormatEventHandler` 在每个结构事件（行/列插入、删除、移动）里与 format/merge 同步调用对应 remap 方法，附件随之迁移。
- **Codec 注册**：序列化/反序列化由业务层通过 `GridOptions` 注册 `CellAttachmentCodec`；core 不解释 data 语义。
- **首消费者**：富文本（rich-text）计划在 cell-kit Phase C 接入，通过 namespace `'richText'` 读写。
