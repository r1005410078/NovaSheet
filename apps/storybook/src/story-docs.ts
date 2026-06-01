import type { Meta, StoryObj } from '@storybook/html'

/** Component-level Docs description in Markdown. */
export function docsMeta(description: string): Pick<Meta, 'parameters'> {
  return {
    parameters: {
      docs: {
        description: { component: description },
      },
    },
  }
}

/** Remove the first-line `// @ts-nocheck` pragma from displayed snippets. */
function stripSnippetPragma(code: string): string {
  return code.replace(/^\s*\/\/\s*@ts-nocheck.*\r?\n/, '')
}

/** Story-level TypeScript source example; the HTML renderer cannot infer TS from render. */
export function docsStory(code: string, storyDescription?: string): Pick<StoryObj, 'parameters'> {
  return {
    parameters: {
      docs: {
        ...(storyDescription ? { description: { story: storyDescription } } : {}),
        source: {
          type: 'code',
          language: 'typescript',
          code: stripSnippetPragma(code),
          state: 'open',
        },
        canvas: {
          sourceState: 'shown',
        },
      },
    },
  }
}
