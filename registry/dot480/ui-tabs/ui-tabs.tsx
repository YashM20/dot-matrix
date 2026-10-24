'use client'
/** Tabs — Dot/480 card `ui-tabs` (interactive: pointer + keyboard edit its data). */
import { DotCard, type DotCardProps } from '@dot480/react'

export type DotTabsProps = Omit<DotCardProps, 'preset' | 'spec'>

export function DotTabs(props: DotTabsProps) {
  return <DotCard preset="ui-tabs" {...props} />
}
