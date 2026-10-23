'use client'
/** Knob — Dot/480 card `ui-knob` (interactive: pointer + keyboard edit its data). */
import { DotCard, type DotCardProps } from '@dot480/react'

export type DotKnobProps = Omit<DotCardProps, 'preset' | 'spec'>

export function DotKnob(props: DotKnobProps) {
  return <DotCard preset="ui-knob" {...props} />
}
