# Cell-Level Type Override — Initiative Roadmap

跨两条 spec 的总路线图。**用途:防止 plan/实现期间或换 session 丢失已锁定决策。** 干活前读这份 + 对应 spec。

## 0. 起源与定位

- **原始需求**:支持"一列多类型"——cell 类型可覆盖列类型;跨列拖拽填充时源格类型盖过目标列类型("A1 类型 A 拖到 B1 类型 B 可被覆盖")。
- **调研结论**:Google 表格无"列类型",是 per-cell value-typed + 格式分层 + per-range 校验叠加。NovaSheet 是列声明类型(`Field.type`,Airtable 路线)。
- **方向裁定(折中)**:**保留 `Field.type` 作列默认/AI 结构**,新增 cell 级覆盖;**可观测行为对齐 Google**,内部结构不丢。`resolveCellType(row,col) = CellTypeStore.get ?? normalizeFieldType(field.type)`。

## 1. 全局锁定决策(贯穿两条 spec)

| 维度 | 决策 |
|---|---|
| 类型主来源 | 列默认 `Field.type` + cell 级覆盖 `CellTypeStore`;`resolveCellType = store.get ?? normalizeFieldType(field.type)` |
| 覆盖触发 | **仅** `setCellType(range,type)` 与 **fill 跨列携带**;**输入不推断类型**(与 Google 的输入即推断刻意分歧——更可控) |
| 还原 | `clearCellType(range)` → 回列默认(镜像 `clearValueFormat`) |
| paste | coerce 到目标格 resolved 类型,**不携带源类型**(沿用既有 `ApplyPaste.coerceForType` 语义) |
| 强制文本(`'`/plain-text) | **不做** |
| sort 混合列 | 跨类型比较器:**数字/日期 < 文本 < 布尔(FALSE<TRUE) < 空**;空恒末尾(不随升降序翻转);降序前三反转。date 与 number 同 rank |
| filter 混合列 | **Option A**:operator 菜单/合法性按**列默认类型**门控;predicate 跑实际值,需要类型解释时可读 resolved type。(全面 Google"按值筛选"parity = 独立 FilterParity 线,延后) |
| per-cell 控件(checkbox/dropdown) | **本期不做**;归 Backlog"单元格自定义类型扩展 API"(painter port + editor 注册缝,现有 `cellRenderers`/`cellEditors` 已有半个缝)另线 |
| 本期标量类型 | number / text / date / boolean(`checkbox`) |
| 其他内置类型分流 | `url` 暂按 text-like 列默认处理,不做独立 override;`singleSelect` / `multiSelect` 归数据验证线;custom string type 归自定义类型扩展 API |
| date 模型 | **结构对齐(b)**:date = serial number,删 `CellValue.Date` 分支(详见 Spec 1) |

### 1.1 类型范围分流

| 类型 | Spec 2 处理 | 后续归属 / 理由 |
|---|---|---|
| `text` | 纳入 `CellTypeOverride` | 标量;`CellValue` 可直接表达;edit/paste/sort/filter/display 语义明确 |
| `number` | 纳入 `CellTypeOverride` | 标量;已有 number coerce / sort / format 路径 |
| `date` | 纳入 `CellTypeOverride` | Spec 1 已完成 serial 模型;日期性可由 resolved type 判定 |
| `checkbox` | 纳入 `CellTypeOverride`(语义类型为 boolean) | 标量;值域是 `boolean`;本期只做类型语义,不做 per-cell 控件 |
| `url` | 不作为独立 override;列级 `url` 继续 text-like 行为 | URL 校验、链接点击/action 属 validation / custom action,不塞进 Spec 2 |
| `singleSelect` | 不纳入 Spec 2 | 依赖 choices、非法值策略、下拉 editor;归数据验证线 |
| `multiSelect` | 不纳入 Spec 2 | 依赖 choices、数组值校验、下拉/多选 editor;归数据验证线 |
| custom string type | 不允许 `setCellType(..., customType)`;列级 custom 继续走现有 registry/fallback | renderer/editor/action 注册缝归 custom-cell-type-extension-API |

## 2. 两条 spec 的顺序与前置关系

```
Spec 1: date-as-serial  ──(前置:日期性从值嗅探→类型判定)──▶  Spec 2: cell-level-type-override
```

**为何 date-first**:cell 级覆盖依赖 `resolveCellType`,而当前日期性靠 `value instanceof Date` 嗅探值。必须先把日期性改为"按类型判定"(Spec 1 ADR-D),Spec 2 的 resolve 机制才能干净接入。Spec 1 只用列级 `field.type`,不依赖 `CellTypeStore`,故可独立先行。

### Spec 1 — date-as-serial 【已完成】
- 文档:`docs/superpowers/specs/2026-06-14-novasheet-date-as-serial-design.md`
- 一句话:`CellValue` 删 `Date`,date = Excel/Google 序列号(1899-12-30 起,小数=时间,datetime,tz-naive UTC,不复刻 1900 闰 bug);日期性改由类型判定;迁移 sort/filter/fill/clipboard/edit/painter;输入硬断 Date。
- 不含 cell 覆盖(见其 §3 Non-goals)。

### Spec 2 — cell-level-type-override 【待 brainstorm】
本初步 scope(brainstorm 时细化,STOP+ASK 任何 plan-risk):
- `CellTypeStore`:稀疏 raw 键 cell→type 覆盖;snapshot/restore(undo);insert/delete/move 行列 remap。**模板 = `RangeStyleStore` 瘦身**。
- `resolveCellType` threading:edit / paint / autofit / sort / filter / fill 全部从 `field.type` 改读 resolved。
- frame per-cell type 通道:type 经 `getFrame()` 下发 painter,**平行于 `cellFormats`**(过架构不变量 #1)。
- fill 跨列 `tileFillType`:镜像 `FillStylePropagator.tileFillFormat`,进 fill undo(`FillStyleSnapshots`)。
- 公开 API:`Grid.setCellType(range,type)` + `clearCellType(range)` + undo handler(镜像 `FormatController`/`FormatUndoHandler`)。
- 跨类型 sort 比较器(见 §1 次序)。
- filter Option A 落地。
- 已锁定:`setCellType` API 全部 view 坐标;frame 用 `resolveCellType` 闭包;默认 date pattern 由 resolved type 触发。

## 3. 延后/独立线(不在本初步,记下防丢)

| 线 | 内容 | 触发 |
|---|---|---|
| FilterParity | 全面 Google filter:"按值筛选"去重列表 + 不门控全类型 condition 菜单(`FilterPopover` 重写) | 若 Option A 不够用 |
| validation | `singleSelect` / `multiSelect` 的 choices、非法值策略、dropdown/multi-select editor、paste/fill 是否携带 validation | 标量 override 落地后 |
| custom-cell-type-extension-API | checkbox/dropdown 等交互控件:canvas painter port + DOM overlay editor 注册缝(Backlog 既有项) | 标量类型落地后 |

## 4. 路线图位置 / 排期

- **新方向**,不在当前文档化路线图(active branch `refactor-default-grid-engine-decomposition` 是纯重构线;next milestone 是 Phase 5-D 条件格式)。
- 与 5-D 的先后由用户裁(未定)。
- **决策推进方式**:Spec 1 已完成;进入 Spec 2 brainstorming → 成文 → writing-plans → 实现四绿。

## 5. 当前状态 / 下一步

- [x] 方向裁定 + 全局决策锁定(§1)
- [x] Spec 1 (date-as-serial) 成文 + 自审
- [x] Spec 1 writing-plans → 实现(typecheck/lint/test/build 四绿)
- [x] Spec 2 (cell-level-type-override) brainstorm → 成文
- [ ] Spec 2 writing-plans → 实现

**下一动作**:用户 review Spec 2;通过后进入 writing-plans。
