'use client'
/** 04 Weather — Dot/480 card `weather`. */
import { DotCard, type DotCardProps } from '@dot480/react'

export type DotWeatherProps = Omit<DotCardProps, 'preset' | 'spec'>

export function DotWeather(props: DotWeatherProps) {
  return <DotCard preset="weather" {...props} />
}
