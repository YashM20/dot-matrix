/**
 * PostHog itself (#151): loaded by `./consent.ts` only after Allow. The slim, no-external build: event capture and
 * nothing else, so no remote script, toolbar, recorder, survey or flags call. Events go to `/ingest` on this site
 * (vercel.json rewrites it to PostHog's US cloud), so the CSP stays `'self'`.
 *
 * Page views are ours: one on start, then one per SPA navigation, from `pushState`, `replaceState` and `popstate`.
 * A history change whose cleaned URL (`./sanitize.ts`) is the one already counted is skipped: that covers the
 * app's own URL tidying on first render and changes to the params we drop (`?p=`, `?flags`).
 */
import posthog from 'posthog-js/dist/module.slim.no-external'
import { cleanProps, cleanUrl, isEventName, isPostHogKey, scrubEvent } from './sanitize'
import type { TrackProps } from '../analytics'

let started = false, on = false, last = ''

function pageview() {
  const url = cleanUrl(location.href)
  if (!on || !url || url === last) return
  last = url
  posthog.capture('$pageview', { $current_url: url })
}

function watchHistory() {
  for (const m of ['pushState', 'replaceState'] as const) {
    const orig = history[m]
    history[m] = function (this: History, ...a: Parameters<History['pushState']>) { const r = orig.apply(this, a); pageview(); return r }
  }
  addEventListener('popstate', pageview)
}

/** Starts (or resumes) capturing, then counts this page. */
export function start(token: string) {
  if (!started) {
    started = true
    posthog.init(token, {
      api_host: '/ingest',
      ui_host: 'https://us.posthog.com',
      defaults: '2026-08-30',
      // only what we send: no autocapture of clicks, page leaves, errors, vitals, heatmaps or rage clicks
      autocapture: false, capture_pageview: false, capture_pageleave: false, capture_exceptions: false,
      capture_performance: false, capture_heatmaps: false, capture_dead_clicks: false, rageclick: false,
      // nothing loaded from elsewhere, and no /flags request (it would switch features back on remotely)
      disable_external_dependency_loading: true, advanced_disable_flags: true, opt_in_site_apps: false,
      disable_session_recording: true, disable_surveys: true, disable_product_tours: true, disable_conversations: true, disable_web_experiments: true,
      // localStorage, no cookies; opted out (and storing nothing) until `opt_in_capturing` below and after `reset`
      persistence: 'localStorage', opt_out_capturing_persistence_type: 'localStorage',
      opt_out_capturing_by_default: true, opt_out_persistence_by_default: true,
      person_profiles: 'identified_only', respect_dnt: true, save_campaign_params: false, mask_personal_data_properties: true,
      before_send: ev => scrubEvent(ev),
    })
    watchHistory()
  } else posthog.reset()
  posthog.opt_in_capturing()
  on = true
  last = ''
  pageview()
}

/** Stops capturing, forgets the anonymous id and deletes everything PostHog stored here. */
export function stop() {
  on = false
  if (!started) return
  posthog.opt_out_capturing()
  posthog.reset()
  for (const s of [localStorage, sessionStorage]) {
    try { for (const k of Object.keys(s)) if (isPostHogKey(k)) s.removeItem(k) } catch { /* storage blocked */ }
  }
  for (const c of document.cookie.split(';')) {
    const k = c.split('=')[0].trim()
    if (isPostHogKey(k)) document.cookie = `${k}=; Max-Age=0; path=/`
  }
}

export function capture(name: string, props?: TrackProps) {
  if (on && isEventName(name)) posthog.capture(name, cleanProps(props))
}
