'use client'

import type { ReactElement } from 'react'

import type { ToasterProps } from 'sonner'
import { CircleCheckIcon, InfoIcon, Loader2Icon, OctagonXIcon, TriangleAlertIcon } from 'lucide-react'
import { useTheme } from 'next-themes'
import { Toaster as Sonner } from 'sonner'

function Toaster({ ...props }: ToasterProps): ReactElement {
  const { theme = 'system' } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps['theme']}
      className="toaster group"
      icons={{
        success: (
          <CircleCheckIcon className="block-4 inline-4" />
        ),
        info: (
          <InfoIcon className="block-4 inline-4" />
        ),
        warning: (
          <TriangleAlertIcon className="block-4 inline-4" />
        ),
        error: (
          <OctagonXIcon className="block-4 inline-4" />
        ),
        loading: (
          <Loader2Icon className="animate-spin block-4 inline-4" />
        ),
      }}
      style={
        {
          '--normal-bg': 'var(--popover)',
          '--normal-text': 'var(--popover-foreground)',
          '--normal-border': 'var(--border)',
          '--border-radius': 'var(--radius)',
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: 'cn-toast',
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
