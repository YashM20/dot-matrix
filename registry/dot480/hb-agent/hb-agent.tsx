'use client'
/** AGENT — Dot/480 card `hb-agent` (interactive: pointer + keyboard edit its data). */
import { DotCard, type DotCardProps } from '@dot480/react'

export type DotHbAgentProps = Omit<DotCardProps, 'preset' | 'spec'>

export function DotHbAgent(props: DotHbAgentProps) {
  return <DotCard preset="hb-agent" {...props} />
}
