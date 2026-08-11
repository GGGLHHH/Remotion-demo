import type { ReactElement } from 'react'
import { Tooltip as TooltipPrimitive } from '@base-ui/react/tooltip'

import { cn } from '#lib/utils'

function TooltipProvider({
  delay = 0,
  ...props
}: TooltipPrimitive.Provider.Props): ReactElement {
  return (
    <TooltipPrimitive.Provider
      data-slot="tooltip-provider"
      delay={delay}
      {...props}
    />
  )
}

function Tooltip({ ...props }: TooltipPrimitive.Root.Props): ReactElement {
  return <TooltipPrimitive.Root data-slot="tooltip" {...props} />
}

function TooltipTrigger({ ...props }: TooltipPrimitive.Trigger.Props): ReactElement {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />
}

function TooltipContent({
  className,
  side = 'top',
  sideOffset = 4,
  align = 'center',
  alignOffset = 0,
  children,
  ...props
}: TooltipPrimitive.Popup.Props
  & Pick<
    TooltipPrimitive.Positioner.Props,
    'align' | 'alignOffset' | 'side' | 'sideOffset'
  >): ReactElement {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Positioner
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
        className="isolate z-50"
      >
        <TooltipPrimitive.Popup
          data-slot="tooltip-content"
          className={cn(
            `
              z-50 inline-flex origin-(--transform-origin) items-center gap-1.5
              rounded-md bg-foreground px-3 py-1.5 text-xs text-background
              inline-fit max-inline-xs
              has-data-[slot=kbd]:pe-1.5
              data-[side=bottom]:slide-in-from-top-2
              data-[side=inline-end]:slide-in-from-left-2
              data-[side=inline-start]:slide-in-from-right-2
              data-[side=left]:slide-in-from-right-2
              data-[side=right]:slide-in-from-left-2
              data-[side=top]:slide-in-from-bottom-2
              **:data-[slot=kbd]:relative **:data-[slot=kbd]:isolate
              **:data-[slot=kbd]:z-50 **:data-[slot=kbd]:rounded-sm
              data-[state=delayed-open]:animate-in
              data-[state=delayed-open]:fade-in-0
              data-[state=delayed-open]:zoom-in-95
              data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95
              data-closed:animate-out data-closed:fade-out-0
              data-closed:zoom-out-95
            `,
            className,
          )}
          {...props}
        >
          {children}
          <TooltipPrimitive.Arrow className="
            z-50 translate-y-[calc(-50%-2px)] rotate-45 rounded-[2px]
            bg-foreground fill-foreground block-2.5 inline-2.5
            data-[side=bottom]:inset-bs-1
            data-[side=inline-end]:-inset-s-1
            data-[side=inline-end]:inset-bs-1/2!
            data-[side=inline-end]:-translate-y-1/2
            data-[side=inline-start]:-inset-e-1
            data-[side=inline-start]:inset-bs-1/2!
            data-[side=inline-start]:-translate-y-1/2
            data-[side=left]:-inset-e-1 data-[side=left]:inset-bs-1/2!
            data-[side=left]:-translate-y-1/2
            data-[side=right]:-inset-s-1 data-[side=right]:inset-bs-1/2!
            data-[side=right]:-translate-y-1/2
            data-[side=top]:-inset-be-2.5
          "
          />
        </TooltipPrimitive.Popup>
      </TooltipPrimitive.Positioner>
    </TooltipPrimitive.Portal>
  )
}

export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger }
