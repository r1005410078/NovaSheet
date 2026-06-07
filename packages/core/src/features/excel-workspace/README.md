# Excel Workspace

`features/excel-workspace` owns the pure rules for Excel-style logical workspace
growth and blank-capacity recycling.

## Responsibilities

- Define the default workspace policy: A-Z columns, 1000 rows, grow batches,
  shrink buffers, max caps, wheel TTL, and cooldowns.
- Decide whether a frame should grow, shrink, or do nothing from visible range,
  scroll intent, content bounds, materialized edge checks, and policy.
- Keep wheel-driven edge growth separate from scrollbar drag and programmatic
  scroll. Scrollbar drag must not create more blank cells.
- Coordinate decisions through `ExcelWorkspaceController` and an explicit port.

## Non-Responsibilities

- No DOM event handling. `dom/scroll/NativeScroller` records native intent.
- No axis or viewport mutation. Runtime forwards decisions to `GridEngine`.
- No storage of blank cells. `SparseExcelDataSource` owns sparse materialization.
- No rendering behavior. Canvas renderers consume normal `RenderFrame` data.

## Invariants

- Shrink may remove only blank capacity.
- Shrink must never drop values, formats, merges, row heights, column widths, or
  future metadata.
- Normal `DataSource` instances are unchanged unless `excelWorkspace` is enabled
  and the engine data source supports workspace resizing.
