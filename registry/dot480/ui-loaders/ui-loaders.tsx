'use client'
/** Loaders — Dot/480 card `ui-loaders` (interactive: pointer + keyboard edit its data). */
import { DotCard, type DotCardProps } from '@dot480/react'

export type DotLoadersProps = Omit<DotCardProps, 'preset' | 'spec'>

export function DotLoaders(props: DotLoadersProps) {
  return <DotCard preset="ui-loaders" {...props} />
}
