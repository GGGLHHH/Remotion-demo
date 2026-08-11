import type { ReactElement } from 'react'
import { Command as CommandPrimitive } from 'cmdk'
import { CheckIcon, SearchIcon } from 'lucide-react'

import * as React from 'react'
import { cn } from '../../lib/utils'
import {
  InputGroup,
  InputGroupAddon,
} from './input-group'

function Command({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive>): ReactElement {
  return (
    <CommandPrimitive
      data-slot="command"
      className={cn(
        `
          flex flex-col overflow-hidden rounded-xl! bg-popover p-1
          text-popover-foreground block-full inline-full
        `,
        className,
      )}
      {...props}
    />
  )
}

function CommandInput({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Input>): ReactElement {
  return (
    <div data-slot="command-input-wrapper" className="p-1 pbe-0">
      <InputGroup className="
        rounded-lg! border-input/30 bg-input/30 shadow-none! block-8!
        *:data-[slot=input-group-addon]:ps-2!
      "
      >
        <CommandPrimitive.Input
          data-slot="command-input"
          className={cn(
            `
              text-sm outline-hidden inline-full
              disabled:cursor-not-allowed disabled:opacity-50
            `,
            className,
          )}
          {...props}
        />
        <InputGroupAddon>
          <SearchIcon className="shrink-0 opacity-50 block-4 inline-4" />
        </InputGroupAddon>
      </InputGroup>
    </div>
  )
}

function CommandList({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.List>): ReactElement {
  return (
    <CommandPrimitive.List
      data-slot="command-list"
      className={cn(
        `
          no-scrollbar scroll-py-1 overflow-x-hidden overflow-y-auto
          outline-none max-block-72
        `,
        className,
      )}
      {...props}
    />
  )
}

function CommandEmpty({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Empty>): ReactElement {
  return (
    <CommandPrimitive.Empty
      data-slot="command-empty"
      className={cn('py-6 text-center text-sm', className)}
      {...props}
    />
  )
}

function CommandGroup({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Group>): ReactElement {
  return (
    <CommandPrimitive.Group
      data-slot="command-group"
      className={cn(
        `
          overflow-hidden p-1 text-foreground
          **:[[cmdk-group-heading]]:px-2 **:[[cmdk-group-heading]]:py-1.5
          **:[[cmdk-group-heading]]:text-xs
          **:[[cmdk-group-heading]]:font-medium
          **:[[cmdk-group-heading]]:text-muted-foreground
        `,
        className,
      )}
      {...props}
    />
  )
}

function CommandSeparator({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Separator>): ReactElement {
  return (
    <CommandPrimitive.Separator
      data-slot="command-separator"
      className={cn('-mx-1 bg-border block-px', className)}
      {...props}
    />
  )
}

function CommandItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Item>): ReactElement {
  return (
    <CommandPrimitive.Item
      data-slot="command-item"
      className={cn(
        `
          group/command-item relative flex cursor-default items-center gap-2
          rounded-sm px-2 py-1.5 text-sm outline-hidden select-none
          in-data-[slot=dialog-content]:rounded-lg!
          data-[disabled=true]:pointer-events-none
          data-[disabled=true]:opacity-50
          data-selected:bg-muted data-selected:text-foreground
          [&_svg]:pointer-events-none [&_svg]:shrink-0
          [&_svg:not([class*='size-'])]:block-4
          [&_svg:not([class*='size-'])]:inline-4
          data-selected:*:[svg]:text-foreground
        `,
        className,
      )}
      {...props}
    >
      {children}
      <CheckIcon className="
        ms-auto opacity-0
        group-has-data-[slot=command-shortcut]/command-item:hidden
        group-data-[checked=true]/command-item:opacity-100
      "
      />
    </CommandPrimitive.Item>
  )
}

function CommandShortcut({
  className,
  ...props
}: React.ComponentProps<'span'>): ReactElement {
  return (
    <span
      data-slot="command-shortcut"
      className={cn(
        `
          ms-auto text-xs tracking-widest text-muted-foreground
          group-data-selected/command-item:text-foreground
        `,
        className,
      )}
      {...props}
    />
  )
}

export {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
}
