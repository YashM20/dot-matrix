'use client'
/** Audio — Dot/480 card `audio-levels`. */
import { DotCard, type DotCardProps } from '@dot480/react'

export type DotAudioLevelsProps = Omit<DotCardProps, 'preset' | 'spec'>

export function DotAudioLevels(props: DotAudioLevelsProps) {
  return <DotCard preset="audio-levels" {...props} />
}
