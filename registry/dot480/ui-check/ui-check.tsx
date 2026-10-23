'use client'
/** Checkbox — Dot/480 card `ui-check` (interactive: pointer + keyboard edit its data). */
import { DotCard, type DotCardProps } from '@dot480/react'

export type DotCheckProps = Omit<DotCardProps, 'preset' | 'spec'>

export function DotCheck(props: DotCheckProps) {
  return <DotCard preset="ui-check" {...props} />
}
