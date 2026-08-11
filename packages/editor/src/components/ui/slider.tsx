import type { ReactElement } from 'react'
import { Slider as SliderPrimitive } from '@base-ui/react/slider'

import { cn } from '../../lib/utils'

function Slider({
  className,
  defaultValue,
  value,
  min = 0,
  max = 100,
  ...props
}: SliderPrimitive.Root.Props): ReactElement {
  const _values = Array.isArray(value)
    ? value
    : Array.isArray(defaultValue)
      ? defaultValue
      : [min, max]

  return (
    <SliderPrimitive.Root
      className={cn(`
        data-horizontal:inline-full
        data-vertical:block-full
      `, className)}
      data-slot="slider"
      defaultValue={defaultValue}
      value={value}
      min={min}
      max={max}
      thumbAlignment="edge"
      {...props}
    >
      <SliderPrimitive.Control className="
        relative flex touch-none items-center select-none inline-full
        data-disabled:opacity-50
        data-vertical:flex-col data-vertical:block-full
        data-vertical:inline-auto data-vertical:min-block-40
      "
      >
        {/* 官方 editor-starter 滑杆样式：8px 圆角轨道 白/20 底 + 白/50 已填充段 */}
        <SliderPrimitive.Track
          data-slot="slider-track"
          className="
            relative grow overflow-hidden rounded-full bg-white/20 select-none
            data-horizontal:block-2 data-horizontal:inline-full
            data-vertical:block-full data-vertical:inline-2
          "
        >
          <SliderPrimitive.Indicator
            data-slot="slider-range"
            className="
              bg-white/50 select-none
              data-horizontal:block-full
              data-vertical:inline-full
            "
          />
        </SliderPrimitive.Track>
        {Array.from({ length: _values.length }, (_, index) => (
          <SliderPrimitive.Thumb
            data-slot="slider-thumb"
            key={index}
            className="
              relative block shrink-0 rounded-full border border-ring bg-white
              ring-ring/50 transition-[color,box-shadow] select-none block-3
              inline-3
              after:absolute after:-inset-2
              hover:ring-3
              focus-visible:ring-3 focus-visible:outline-hidden
              active:ring-3
              disabled:pointer-events-none disabled:opacity-50
            "
          />
        ))}
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  )
}

export { Slider }
