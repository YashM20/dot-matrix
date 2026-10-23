'use client'
/** Keypad — Dot/480 card `ui-keypad` (interactive: pointer + keyboard edit its data). */
import { DotCard, type DotCardProps } from '@dot480/react'

export type DotKeypadProps = Omit<DotCardProps, 'preset' | 'spec'>

export function DotKeypad(props: DotKeypadProps) {
  return <DotCard preset="ui-keypad" {...props} />
}
