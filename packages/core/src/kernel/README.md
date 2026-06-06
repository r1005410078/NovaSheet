# kernel/

平台无关原语、跨域协议、undo 机制与交互基建。**不依赖** `features/` 或 `engine/`。

依赖方向：`kernel` ← `features` ← `engine`（组合根）。

## 单一主人判准

被多个 feature 共用、且无单一用户可见能力主人 → 放 `kernel/`。只服务某一能力 → 放 `features/<domain>/`。

## 子目录

| 目录 | 职责 |
| --- | --- |
| `geometry/` | ChunkedAxis、Viewport、FrozenRegions、range、columnLetter |
| `data/` | DataSource、Schema、MutableDataSource、VisibleColumnsDataSource |
| `theme/` | Theme tokens（`denseGridTheme`） |
| `measure/` | TextMeasurer、wrapText |
| `render/` | RenderFrame 契约 + renderer 消费的 payload contract（edit session、collapsed gap、header decoration source） |
| `util/` | FrameScheduler（raf）等 |
| `coords/` | view↔raw 坐标（coordinates、CoordinateSpace、remap）+ 跨域坐标类型（CellRange/GridSelection/MergeRegion） |
| `protocol/` | GridOperation、GridDomainEvent、GridEventPipeline + operation/event/format 数据 contract |
| `undo/` | UndoCommand、UndoStack、UndoRegistry、UndoReplay、UndoHandler（**机制 only**，具体 kind handler 在 features） |
| `interaction/` | HitTest、CellLayout、HandleLayout、scrollCellIntoView |

## 约束

- 不含 DOM、canvas、web 包引用。
- `GridOperation` / `GridDomainEvent` / row-column operation-event 类型定义在 `protocol/`；feature 侧可保留 re-export 作为领域导航入口。
- `kernel/` 只拥有跨域数据形状与协议形状，不拥有 feature behavior/store/controller。
