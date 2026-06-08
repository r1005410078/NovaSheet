import { describe, expect, it } from 'bun:test'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseScenarioFile, parseScenarioFiles } from '../../src/parse/markdown'

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures')

describe('parseScenarioFile', () => {
  it('parses frontmatter and G/W/T list items', () => {
    const entry = parseScenarioFile(join(FIXTURES, 'L3b-undo-redo.md'))

    expect(entry.id).toBe('excel.L3b.undo-redo')
    expect(entry.layer).toBe('L3b')
    expect(entry.summary).toBe('toolbar 点 undo 调用 grid.undo')
    expect(entry.tags).toEqual(['toolbar', 'undo'])
    expect(entry.status).toBe('draft')
    expect(entry.given).toEqual(['NovaExcel 已挂载，dense data'])
    expect(entry.when).toEqual(['点击 `[data-action-id="undo"]`'])
    expect(entry.then).toEqual([
      '`grid.undo` 被调用',
      '`onToolbarAction({ id: \'undo\' })` 触发',
    ])
  })

  it('extracts multi-paragraph User Story with blank lines', () => {
    const entry = parseScenarioFile(join(FIXTURES, 'L3b-undo-redo.md'))

    expect(entry.userStory).toContain('作为表格用户')
    expect(entry.userStory).toContain('撤销后，工具栏按钮的可用状态')
    expect(entry.userStory).toContain('\n\n')
  })

  it('omits userStory when section is absent', () => {
    const entry = parseScenarioFile(join(FIXTURES, 'L3a-default-mount.md'))

    expect(entry.userStory).toBeUndefined()
    expect(entry.id).toBe('excel.L3a.default-mount')
  })
})

describe('parseScenarioFiles', () => {
  it('globs and parses multiple scenario files', async () => {
    const entries = await parseScenarioFiles(join(FIXTURES, '*.md'), FIXTURES)

    expect(entries).toHaveLength(2)
    expect(entries.map((e) => e.id).sort()).toEqual([
      'excel.L3a.default-mount',
      'excel.L3b.undo-redo',
    ])
  })
})
