'use client'
/** 02 Music — Dot/480 card `music`. */
import { DotCard, type DotCardProps } from '@dot480/react'

export type DotMusicProps = Omit<DotCardProps, 'preset' | 'spec'>

export function DotMusic(props: DotMusicProps) {
  return <DotCard preset="music" {...props} />
}
