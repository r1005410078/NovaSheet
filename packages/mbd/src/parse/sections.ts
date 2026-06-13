export interface ParsedSections {
  readonly userStory?: string
  readonly given: readonly string[]
  readonly when: readonly string[]
  readonly then: readonly string[]
}

interface SectionBlock {
  readonly title: string
  readonly content: string
}

const USER_STORY_TITLES = new Set(['user story', '用户故事'])

function normalizeTitle(title: string): string {
  return title.trim().toLowerCase()
}

/** Split markdown body into level-2 sections. */
export function splitSections(body: string): readonly SectionBlock[] {
  const normalized = body.replace(/\r\n/g, '\n').trim()
  if (normalized.length === 0) return []

  const parts = normalized.split(/\n(?=## )/g)
  const sections: SectionBlock[] = []

  for (const part of parts) {
    const match = /^## ([^\n]+)\n?([\s\S]*)$/u.exec(part)
    if (!match) continue
    sections.push({
      title: match[1]!.trim(),
      content: match[2] ?? '',
    })
  }

  return sections
}

function extractListItems(content: string): readonly string[] {
  const items: string[] = []
  for (const line of content.split('\n')) {
    const match = /^\s*-\s+(.+?)\s*$/u.exec(line)
    if (match) items.push(match[1]!)
  }
  return items
}

function extractProse(content: string): string | undefined {
  const trimmed = content.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

/** Extract User Story prose and G/W/T bullet lists from scenario body. */
export function parseSections(body: string): ParsedSections {
  const sections = splitSections(body)
  let userStory: string | undefined
  const given: string[] = []
  const when: string[] = []
  const then: string[] = []

  for (const section of sections) {
    const title = normalizeTitle(section.title)
    if (USER_STORY_TITLES.has(title)) {
      userStory = extractProse(section.content)
      continue
    }
    if (title === 'given') {
      given.push(...extractListItems(section.content))
      continue
    }
    if (title === 'when') {
      when.push(...extractListItems(section.content))
      continue
    }
    if (title === 'then') {
      then.push(...extractListItems(section.content))
    }
  }

  // oxlint-disable-next-line unicorn/no-thenable -- BDD manifest schema requires a `then` field.
  return { userStory, given, when, then }
}
