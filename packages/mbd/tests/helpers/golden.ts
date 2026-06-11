import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * 黄金文件断言：`actual` 与 `<testDir>/__goldens__/<name>.golden.txt` 逐字符比较。
 * 与 core 同约定（测试 helper 不跨包共享，故本包复制一份）。
 *
 * 更新流程：`GOLDEN_UPDATE=1 bun test <file>` 重生成 → git diff review 生成内容 → 提交。
 * 黄金文件是行为契约的一部分——生成后必须人工 review，禁止盲目更新掩盖回归。
 */
export function expectGolden(testDir: string, name: string, actual: string): void {
  const goldenDir = join(testDir, '__goldens__')
  const goldenPath = join(goldenDir, `${name}.golden.txt`)

  if (process.env.GOLDEN_UPDATE === '1') {
    mkdirSync(goldenDir, { recursive: true })
    writeFileSync(goldenPath, actual)
    return
  }

  if (!existsSync(goldenPath)) {
    throw new Error(
      `golden 缺失: ${goldenPath}\n运行 GOLDEN_UPDATE=1 bun test 生成，review 后提交。`,
    )
  }

  const expected = readFileSync(goldenPath, 'utf8')
  if (actual !== expected) {
    throw new Error(
      `golden 不匹配: ${goldenPath}\n--- expected ---\n${expected}--- actual ---\n${actual}--- end ---\n` +
        `行为变更属预期时运行 GOLDEN_UPDATE=1 重生成，并在 git diff 中 review。`,
    )
  }
}
