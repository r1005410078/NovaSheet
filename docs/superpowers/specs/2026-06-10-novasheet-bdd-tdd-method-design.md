# NovaSheet 开发方法 — BDD 外环 × TDD 内环 — 设计

- **日期**：2026-06-10
- **状态**：设计（流程绑定文档；不引工具、不加 CI 门禁、不扩覆盖）
- **分支**：`refactor-default-grid-engine-decomposition`
- **定位**：把 BDD **外环** / TDD **内环**显式钉进 superpowers 管线的**流程规范**
- **前置**：
  - [`2026-06-08-novasheet-behavioral-testing-design.md`](./2026-06-08-novasheet-behavioral-testing-design.md)（L0–L4 行为测试架构 + Phase 1 Core L0–L2 分批启动）
  - [`2026-06-09-novasheet-mbd-package-design.md`](./2026-06-09-novasheet-mbd-package-design.md)（MD 场景制品 + manifest + 覆盖率）

---

## 1. 目的与定位

NovaSheet 已具备完整的 **BDD 制品层**（`@novasheet/mbd` 的 `scenarios/*.md`：`## User Story` + Given/When/Then、`scenarios.manifest.json`、`lint:scenario-coverage`）和 **行为测试架构**（L0–L4）。缺的不是工具，而是**流程绑定**——在 superpowers 管线里，场景从未被设成正式 gate。

**本文档只做一件事**：定义 NovaSheet 的开发方法 = **BDD 外环（先锁可观测行为）× TDD 内环（驱动实现）**，并规定它如何嵌入既有 superpowers 管线。

### 非目标（YAGNI）

1. **不引入新工具 / 新 CLI**——复用 `@novasheet/mbd`、`lint:scenario-coverage`
2. **不加 CI 门禁**——不强制 PR 必须带场景（纪律靠流程，不靠 gate 阻断）
3. **不一次性扩全量覆盖**——Core L0–L2 由 `2026-06-11-novasheet-core-public-api-bdd-roadmap.md` 分批落地
4. **不替换、不削弱 TDD**——内环仍是红→绿→重构
5. **不把方法论塞进 CLAUDE.md 全文**——CLAUDE.md 只放 load-bearing 指针（见 §6）

### 方法论 vs 活跃落点（关键区分）

本文档**描述全分层 L0–L4 的方法**；当前实际活跃层由 behavioral-testing 规格 Phase 1 决定：Core L0–L2 分批启动，Excel L3 继续维护。两者不冲突：

> 方法论是"怎么做"的稳定规范，覆盖所有层；Phase 1 路线是"现在按什么批次做"的范围闸门。新功能开发前先看 behavioral-testing Phase 1 与 Core BDD 路线计划确认活跃层。

---

## 2. 双环模型（核心）

```text
BDD 外环（行为 / 验收，业务语言，outside-in）
   场景 MD(User Story + G/W/T) ──► 失败行为测试(外环红) ──────────┐
        ▲  单一真相 = 场景；测试 title 以 scenario id 开头         │
        │                                                          │ 一个 feature 一圈
TDD 内环（实现单元，inside-out，红绿重构）                          │
   kernel / features / engine：红 → 绿 → 重构，逐单元 ◄───────────┘
        └─► 内环全绿 ⇒ 外环行为测试转绿 ⇒ 外环重构
```

| 维度 | BDD 外环 | TDD 内环 |
| --- | --- | --- |
| 回答 | "做对了什么"（可观测行为） | "怎么做出来"（实现单元） |
| 方向 | outside-in（从用户面往里） | inside-out（从单元往外） |
| 语言 | 业务 / 用户（User Story + G/W/T） | 技术（断言领域 API、数据、undo 栈） |
| 真相 | `scenarios/*.md`（mbd） | 测试体本身 |
| 一圈粒度 | 一个 feature / 用户旅程 | 一个实现单元 |
| 转绿时机 | 内环全绿后自然转绿 | 每单元独立红→绿 |

**铁律**：外环只罩"用户可观测行为"（L0–L3）；**kernel 算法与 L4 渲染白盒是纯 TDD，不强行套场景**。

---

## 3. 嵌入 superpowers 管线

现有管线 `brainstorming → writing-plans → subagent-driven-development → finishing-a-development-branch`，插入**一个场景 gate**：

| superpowers 步骤 | 现状 | 加 BDD 后 |
| --- | --- | --- |
| brainstorming → spec | 设计含 testing 节 | 不变 |
| **【新 gate】场景定稿** | 隐式 | 写 / 改 `scenarios/*.md`（先 `## User Story`，再 G/W/T）作为外环验收契约；`mbd validate` + `mbd manifest` |
| writing-plans → plan | 任务 = TDD 红绿 | plan **第一类任务** = 让行为测试存在并红；其余任务 = TDD 内环 |
| subagent-driven-development | TDD 内环 | 不变（内环照旧红→绿→重构） |
| 外环收口 | — | 内环全绿 → 行为测试转绿 → `lint:scenario-coverage` 不退化 |
| finishing-a-development-branch | — | 不变 |

**gate 语义**：场景 MD 是 feature 的可观测契约真相。无场景不开内环。契约漂移时**优先修门面 / 补公开观测 API，禁止静默改场景期望**（沿用 behavioral-testing §6.3）。

---

## 4. 分层映射 L0–L4

| 层 | 外环（BDD） | 内环（TDD） | Phase 1 活跃 |
| --- | --- | --- | --- |
| **L0** 场景规格 | `packages/core/tests/acceptance/**/scenarios/*.md` + L3 `scenarios/*.md` | — | ✅（Core + Excel） |
| **L1** 引擎 oracle | Core MBD 场景 + 手写 `bun:test` 调 `DefaultGridEngine` | `engine/`、`features/` 单元红绿 | ✅（分批启动） |
| **L2** Grid 门面 | Core MBD 场景 + 手写 `bun:test` 调 `Grid` facade | `dom/runtime` 接线 TDD | ✅（分批启动） |
| **L3** excel 适配 | MBD 场景 → 行为测试 | 组件 / hook TDD | ✅（持续维护） |
| **L4** 渲染白盒 | **不 BDD-front** | painter `RecordingContext` 纯 TDD | ✅（纯 TDD） |

- **L4 与 kernel 算法是纯 TDD**——painter ctx 序列、`ChunkedAxis` 数学是实现细节，非用户行为，不写场景。
- **L1/L2 BDD 与 Core TDD 并行**——场景锁公开契约，单元测试继续锁算法、领域边界和异常路径。

---

## 5. 单 feature 工作流

```text
1. 写 / 改 scenarios/*.md   →  mbd validate && mbd manifest      （外环契约定稿）
2. 写失败行为测试            →  it('core.Lx.…') / it('excel.L3x.…') 见红 （外环红）
3. writing-plans 拆内环任务  →  subagent 逐个 TDD 红→绿→重构      （内环）
4. 内环全绿                 →  行为测试自然转绿 → coverage 不退化 （外环绿）
5. 外环重构 + finishing-a-development-branch
```

**推荐顺序（与 mbd §8.2.4 一致）**：`validate → manifest → 提交清单 → 手写 it → lint:scenario-coverage → bun test`。

---

## 6. 文档放置与可发现性（让 agent 干活时一定看到）

只有 `CLAUDE.md` 每个 session 自动加载、保证被读；放在 `docs/` 的 spec 不会被自动读。所以**三层放置**：

| 层 | 放哪 | 作用 | 保证读到 |
| --- | --- | --- | --- |
| **完整方法论** | 本 spec | 双环模型、L0–L4 映射、工作流全文 | ❌ 仅被指到时读 |
| **load-bearing 指针** | `CLAUDE.md` →「Working with the Superpowers pipeline」 | 加场景 gate 进管线 + 一行链接 | ✅ 每 session 自动加载 |
| **subagent 注入** | `CLAUDE.md` →「Subagent prompts must:」 | 派发实现者时必须带方法论 + 相关 `scenarios/*.md` 路径 | ✅ 控制器据此注入 |

> subagent 不靠自动加载方法论——靠控制器在派发 prompt 时**显式带上文档路径**。这是 CLAUDE.md「Subagent prompts must reference the plan file path」的延伸。

**更重的替代（暂不采纳）**：把方法论做成 project-local **skill**（`Skill` 工具触发时强制执行）。属于"工具 / 自动化"，超出本次"只做流程绑定文档"范围；若 CLAUDE.md 指针被证明约束力不足，再升级。

---

## 7. 与现有文档 / 包的关系（不重复，链接）

| 文档 / 包 | 关系 |
| --- | --- |
| `2026-06-08-novasheet-behavioral-testing-design.md` | 提供 L0–L4 **架构** + Phase 1 范围；本文档提供**流程**，不复制其层定义 |
| `2026-06-09-novasheet-mbd-package-design.md` | 提供场景**制品格式 + 工具**；本文档规定何时写、谁消费 |
| `@novasheet/mbd` | 外环契约的解析 / manifest / 覆盖率工具 |
| `CLAUDE.md` | 本方法论的 load-bearing 入口（§6） |

---

## 8. ADR

### ADR-A：场景 gate 放 writing-plans 之前 vs 作为 plan 首任务

| 方案 | 优点 | 缺点 |
| --- | --- | --- |
| **场景先于 plan（采纳）** | plan 拆分有可观测契约可依；外环红先于内环 | brainstorming 与场景定稿衔接需自觉 |
| 场景作为 plan 首任务 | 全在 plan 内 | 容易被当普通 task 跳过，丧失"契约先行"语义 |

**决策**：场景定稿是 brainstorming → writing-plans 之间的**显式 gate**，不是 plan 内的普通任务。

### ADR-B：CLAUDE.md 指针 vs project-local skill

| 方案 | 优点 | 缺点 |
| --- | --- | --- |
| **CLAUDE.md 指针（采纳）** | 零工具；与 behavioral-testing / mbd 同款做法；改动小 | 约束靠自觉，非强制执行 |
| project-local skill | `Skill` 触发时强制 | 属工具 / 自动化，超出本次范围 |

**决策**：先用 CLAUDE.md 指针 + subagent 注入；不足再升级 skill。

### ADR-C：是否对全分层 L0–L4 立即铺开

**决策**：方法论**描述**全分层；**落点**由 behavioral-testing Phase 1 和 Core BDD 路线计划管。Core L0–L2 已启动但分批落地，Excel L3 持续维护，L4 仍纯 TDD。

---

## 9. 落地清单（本次）

1. 本 spec（已写）
2. `CLAUDE.md` 编辑两处：
   - 「Working with the Superpowers pipeline」管线加**场景 gate**（步骤 2.5）+ 链接本 spec
   - 「Subagent prompts must:」加一条：派发实现者须带方法论 + 相关 `scenarios/*.md` 路径
3. 无新工具、无 CI 改动、无覆盖扩张
