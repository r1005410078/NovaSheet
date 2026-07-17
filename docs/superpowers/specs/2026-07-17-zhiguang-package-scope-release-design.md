# `@zhiguang/*` 包作用域迁移与私有 registry 发布设计

- **日期**：2026-07-17
- **状态**：设计，待用户审阅
- **分支**：`chore/zhiguang-scope-release`
- **范围**：workspace 包身份、内部依赖/import、当前使用文档、Bun lockfile 与私有 registry 发布；不改运行时 Grid 行为

## 1. 问题

NovaSheet 的可发布包和 workspace 内部依赖当前统一使用 `@novasheet/*`。目标私有 registry 的组织 scope 为 `@zhiguang/*`，若只改 `package.json.name`，其余包的依赖、源码 import、Bun workspace lockfile 和使用文档仍会引用旧包名，构建产物无法被消费者安装。

发布目标为 `http://registry.econ-tech.cn/`。认证只从本机环境或用户的私有配置读取，不能提交 token、用户名或密码到仓库。

## 2. 目标

1. 所有 workspace package identity 由 `@novasheet/*` 一致迁移为 `@zhiguang/novasheet-*`。
2. 所有当前源码、测试、构建脚本和 Storybook 内部 import/dependency 使用新 scope。
3. `bun.lock` 的 workspace package 图同步为新 scope。
4. 当前使用者文档、发布文档、仓库工作规则中的安装命令和 filter 改用新 scope。
5. 四个公开包按依赖拓扑可发布到私有 registry：`core → canvas2d → react → cell-kit`。
6. 保留历史 release note、Changelog、历史 spec 和计划中的旧 scope，保持历史记录真实性。

## 3. 非目标

| 非目标 | 原因 |
| --- | --- |
| 改变 NovaSheet 仓库名、GitHub URL 或产品品牌 | 用户只指定 npm scope 与发布 registry |
| 发布 `@zhiguang/mbd` 或 `@zhiguang/storybook` | 两者继续为 private / release 忽略的 workspace 工具 |
| 将旧 `@novasheet/*` 包下架或做 deprecated 标记 | 对外 registry 状态变更需要独立授权 |
| 修改公开包版本 | 新 scope 是新包名；各包保留当前 `0.1.0`，发布前仍检查版本占用 |
| 提交认证凭据 | token 仅通过 `NPM_CONFIG_TOKEN` 或用户私有 `.npmrc` 提供 |
| 重写 `CHANGELOG.md`、`docs/release/**`、`docs/superpowers/{plans,specs}/**` | 它们描述历史实现和历史包名，改写会误导审计 |

## 4. 包名映射与发布范围

| 现有名称 | 新名称 | 发布 |
| --- | --- | --- |
| `@novasheet/core` | `@zhiguang/novasheet-core` | 是 |
| `@novasheet/canvas2d` | `@zhiguang/novasheet-canvas2d` | 是，依赖 core |
| `@novasheet/react` | `@zhiguang/novasheet-react` | 是，依赖 core、canvas2d |
| `@novasheet/cell-kit` | `@zhiguang/novasheet-cell-kit` | 是，依赖 core、canvas2d，peer 依赖 react |
| `@novasheet/mbd` | `@zhiguang/novasheet-mbd` | 否，继续 private |
| `@novasheet/storybook` | `@zhiguang/novasheet-storybook` | 否，继续 Changesets ignore |

包版本维持 `0.1.0`。每个公开包仅包含其既有 `dist/` files；在 publish 前必须重新构建并以 `bun publish --dry-run` 检查 tarball 内容。

## 5. 迁移规则

### 5.1 Package metadata 与 workspace graph

1. 修改四个公开包、`mbd` 和 Storybook 的 `name`。
2. 将 `dependencies`、`devDependencies`、`peerDependencies` 中的内部 package key 改为新 scope，语义化版本范围保持原值。
3. 更新 Changesets 的 Storybook ignore 项。
4. 用 Bun 更新 `bun.lock`，不得手写 lockfile。

### 5.2 源码、测试与当前文档

替换非历史路径中的 `@novasheet/` import/type import、Bun workspace filter、安装命令和包关系图，至少包括：

- `packages/**/{src,tests,README*,docs,build.ts,package.json,mbd.config.ts}`；
- `apps/storybook/**` 和 `apps/storybook/package.json`；
- 根 `README*`、`AGENTS.md`、`CLAUDE.md`、`CONTRIBUTING.md`、`docs/architecture.md`、`docs/npm-publishing.md`；
- 根 `package.json`、`mbd.config.ts` 和 `.changeset/config.json`。

历史记录目录不替换，但 release branch 的新增规格和发布说明使用 `@zhiguang/*`。

### 5.3 Registry 与认证

根 `.npmrc` 使用：

```ini
registry=http://registry.econ-tech.cn/
@zhiguang:registry=http://registry.econ-tech.cn/
```

第二行令 scoped 安装和发布意图明确；不写入任何 credential。发布命令显式传入 `--registry http://registry.econ-tech.cn/`，避免用户全局配置覆盖项目设置。

发布前环境必须存在可用的 `NPM_CONFIG_TOKEN`，并且 `bun pm whoami` 对 registry 成功。若 registry 要求 OTP，由发布者在本机终端输入；token 或 OTP 不进入命令历史、提交或对话。

## 6. 发布流程

```text
scope rename
  -> bun install（生成 workspace lockfile）
  -> lint / typecheck / test / Core→Canvas2D→React→cell-kit build
  -> 各公开包 bun publish --dry-run
  -> 检查 registry 中 @zhiguang/*@0.1.0 未占用
  -> core → canvas2d → react → cell-kit 发布
  -> bun pm view 验证 tag、版本与内部依赖解析
```

发布顺序是依赖顺序。若任一包发布失败，停止后续发布并报告已成功的精确包版本；不使用 `--tolerate-republish` 掩盖版本冲突。

## 7. 验证

| 验证 | 目的 |
| --- | --- |
| `rg '@novasheet/'`（排除历史目录）为空 | 防止新旧 scope 混用 |
| `bun install --frozen-lockfile` 或等价 lockfile 同步检查 | workspace 图可解析 |
| `bun run lint` | 架构、场景和代码静态约束 |
| `bun run --filter '*' typecheck` | 新 package import 可解析 |
| `bun test` | 运行时行为不回归 |
| `core → canvas2d → react → cell-kit` build | 发布的 dist 与依赖拓扑正确 |
| 每个 `bun publish --dry-run` | tarball 仅含预期文件与新 package name |
| registry view / 安装 smoke | 已发布版本和新 scope 可供消费者解析 |

## 8. ADR

### ADR-A：全 workspace 一次迁移，而不是只重命名四个公开 package

采纳全 workspace 迁移。`mbd` 和 Storybook 虽不发布，但它们在 workspace graph、Bun filter 和源码 import 中引用公开 package；保留旧 scope 会使 lockfile 与本地开发出现两套身份。

### ADR-B：保留历史文档中的旧 scope

采纳只更新当前使用文档。历史计划、规格和 release note 是历史状态的审计材料；将它们批量替换为新 scope 会制造“当时已使用新包名”的错误记录。

### ADR-C：认证只走环境变量/私有配置

采纳 `NPM_CONFIG_TOKEN` 或用户私有 `.npmrc`。项目 `.npmrc` 只记录 registry URL；避免 token 出现在 Git、测试输出和发布分支。

## 9. 实现切片

1. 迁移 package metadata、内部依赖和 Changesets ignore，更新 `.npmrc` 注释与 scope registry。
2. 替换当前源码、测试、脚本和当前使用文档的 scope；保留历史目录。
3. 用 Bun 同步 lockfile，建立“非历史路径无旧 scope”检查。
4. 完成四门验证和四个 package 的 publish dry-run。
5. 认证可用后按依赖顺序发布并做 registry 验证。
