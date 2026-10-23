'use client'
/** Progress — Dot/480 card `ui-progress` (interactive: pointer + keyboard edit its data). */
import { DotCard, type DotCardProps } from '@dot480/react'

export type DotProgressProps = Omit<DotCardProps, 'preset' | 'spec'>

export function DotProgress(props: DotProgressProps) {
  return <DotCard preset="ui-progress" {...props} />
}
