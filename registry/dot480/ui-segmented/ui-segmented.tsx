'use client'
/** Segmented — Dot/480 card `ui-segmented` (interactive: pointer + keyboard edit its data). */
import { DotCard, type DotCardProps } from '@dot480/react'

export type DotSegmentedProps = Omit<DotCardProps, 'preset' | 'spec'>

export function DotSegmented(props: DotSegmentedProps) {
  return <DotCard preset="ui-segmented" {...props} />
}
