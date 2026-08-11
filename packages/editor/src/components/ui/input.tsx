import type { ReactElement } from 'react'
import { Input as InputPrimitive } from '@base-ui/react/input'
import * as React from 'react'

import { cn } from '#lib/utils'

function Input({ className, type, ...props }: React.ComponentProps<'input'>): ReactElement {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        `
          rounded-lg border border-input bg-transparent px-2.5 py-1 text-base
          transition-colors outline-none block-8 inline-full min-inline-0
          file:inline-flex file:border-0 file:bg-transparent file:text-sm
          file:font-medium file:text-foreground file:block-6
          placeholder:text-muted-foreground
          focus-visible:border-ring focus-visible:ring-3
          focus-visible:ring-ring/50
          disabled:pointer-events-none disabled:cursor-not-allowed
          disabled:bg-input/50 disabled:opacity-50
          aria-invalid:border-destructive aria-invalid:ring-3
          aria-invalid:ring-destructive/20
          md:text-sm
          dark:bg-input/30
          dark:disabled:bg-input/80
          dark:aria-invalid:border-destructive/50
          dark:aria-invalid:ring-destructive/40
        `,
        className,
      )}
      {...props}
    />
  )
}

export { Input }
