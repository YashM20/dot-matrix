'use client'
/** Stepper — Dot/480 card `ui-stepper` (interactive: pointer + keyboard edit its data). */
import { DotCard, type DotCardProps } from '@dot480/react'

export type DotStepperProps = Omit<DotCardProps, 'preset' | 'spec'>

export function DotStepper(props: DotStepperProps) {
  return <DotCard preset="ui-stepper" {...props} />
}
