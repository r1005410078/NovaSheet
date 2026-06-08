/** Split YAML frontmatter and markdown body. */
export function splitFrontmatter(content: string): { frontmatter: string; body: string } {
  const normalized = content.replace(/\r\n/g, '\n')
  if (!normalized.startsWith('---\n')) {
    throw new Error('scenario file must start with frontmatter (---)')
  }

  const end = normalized.indexOf('\n---\n', 4)
  if (end < 0) {
    throw new Error('scenario file frontmatter is not closed (---)')
  }

  return {
    frontmatter: normalized.slice(4, end),
    body: normalized.slice(end + 5),
  }
}

/** Parse YAML frontmatter into a plain object. */
export function parseFrontmatterYaml(frontmatter: string): Record<string, unknown> {
  const parsed = Bun.YAML.parse(frontmatter)
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('frontmatter must be a YAML object')
  }
  return parsed as Record<string, unknown>
}
