'use client'
/** Text Field — Dot/480 card `ui-text-field` (interactive: pointer + keyboard edit its data). */
import { DotCard, type DotCardProps } from '@dot480/react'

export type DotTextFieldProps = Omit<DotCardProps, 'preset' | 'spec'>

export function DotTextField(props: DotTextFieldProps) {
  return <DotCard preset="ui-text-field" {...props} />
}
