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
          code,
          state: 'open',
        },
        canvas: {
          sourceState: 'shown',
        },
      },
    },
  }
}
