'use client'
/** 01 Home — Dot/480 card `home-clock`. */
import { DotCard, type DotCardProps } from '@dot480/react'

export type DotHomeClockProps = Omit<DotCardProps, 'preset' | 'spec'>

export function DotHomeClock(props: DotHomeClockProps) {
  return <DotCard preset="home-clock" {...props} />
}
