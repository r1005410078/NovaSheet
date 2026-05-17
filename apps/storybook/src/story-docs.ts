import type { Meta, StoryObj } from '@storybook/html'

/** 组件级 Docs 说明（Markdown）。 */
export function docsMeta(description: string): Pick<Meta, 'parameters'> {
  return {
    parameters: {
      docs: {
        description: { component: description },
      },
    },
  }
}

/** Snippet 文件首行的 `// @ts-nocheck` 是给 IDE 用的，展示时剥掉。 */
function stripSnippetPragma(code: string): string {
  return code.replace(/^\s*\/\/\s*@ts-nocheck.*\r?\n/, '')
}

/** Story 级 TypeScript 源码示例（HTML renderer 无法从 render 自动提取 TS）。 */
export function docsStory(
  code: string,
  storyDescription?: string,
): Pick<StoryObj, 'parameters'> {
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
