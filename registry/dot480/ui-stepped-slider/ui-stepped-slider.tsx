'use client'
/** Stepped Slider — Dot/480 card `ui-stepped-slider` (interactive: pointer + keyboard edit its data). */
import { DotCard, type DotCardProps } from '@dot480/react'

export type DotSteppedSliderProps = Omit<DotCardProps, 'preset' | 'spec'>

export function DotSteppedSlider(props: DotSteppedSliderProps) {
  return <DotCard preset="ui-stepped-slider" {...props} />
}
