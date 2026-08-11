import type { ReactElement } from 'react'
import { Loader2Icon } from 'lucide-react'
import { cn } from '../../lib/utils'

function Spinner({ className, ...props }: React.ComponentProps<'svg'>): ReactElement {
  return (
    <Loader2Icon
      data-slot="spinner"
      role="status"
      aria-label="Loading"
      className={cn(`animate-spin block-4 inline-4`, className)}
      {...props}
    />
  )
}

export { Spinner }
