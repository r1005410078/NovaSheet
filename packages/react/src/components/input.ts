import React from 'react'
import { cva } from 'class-variance-authority'
import type { VariantProps } from 'class-variance-authority'
import type { InputHTMLAttributes, ReactElement } from 'react'

import { cn } from '@/lib/utils'

export const inputVariants = cva(
  'h-7 w-[112px] rounded-full border-0 bg-white px-3 py-0 pl-7 text-[13px] text-[#3c4043] shadow-none outline-none ring-1 ring-[#dadce0] placeholder:text-[#5f6368] focus-visible:ring-2 focus-visible:ring-[#1a73e8]/40',
  {
    variants: {
      variant: {
        toolbar: '',
      },
    },
    defaultVariants: {
      variant: 'toolbar',
    },
  },
)

export interface InputProps
  extends InputHTMLAttributes<HTMLInputElement>,
    VariantProps<typeof inputVariants> {}

export function Input({ className, variant, ...props }: InputProps): ReactElement {
  return React.createElement('input', {
    ...props,
    className: cn(inputVariants({ variant }), className),
  })
}
