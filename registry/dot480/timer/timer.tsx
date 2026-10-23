'use client'
/** 03 Timer — Dot/480 card `timer`. */
import { DotCard, type DotCardProps } from '@dot480/react'

export type DotTimerProps = Omit<DotCardProps, 'preset' | 'spec'>

export function DotTimer(props: DotTimerProps) {
  return <DotCard preset="timer" {...props} />
}
