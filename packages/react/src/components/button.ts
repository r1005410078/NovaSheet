import React from 'react'
import { cva } from 'class-variance-authority'
import type { VariantProps } from 'class-variance-authority'
import type { ButtonHTMLAttributes, ReactElement } from 'react'

import { cn } from '@/lib/utils'

export const buttonVariants = cva(
  'inline-flex h-7 min-w-7 items-center justify-center gap-1 rounded px-1.5 text-[13px] leading-none text-slate-700 transition-colors hover:bg-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-45',
  {
    variants: {
      variant: {
        ghost: 'border-0 bg-transparent',
        outline: 'border border-slate-400 bg-white',
      },
      control: {
        button: '',
        select: 'min-w-9',
        stepper: 'min-w-[34px]',
      },
    },
    defaultVariants: {
      variant: 'ghost',
      control: 'button',
    },
  },
)

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  readonly [key: `data-${string}`]: string | undefined
}

export function Button({
  className,
  variant,
  control,
  type = 'button',
  ...props
}: ButtonProps): ReactElement {
  return React.createElement('button', {
    ...props,
    type,
    className: cn(buttonVariants({ variant, control }), className),
  })
}
