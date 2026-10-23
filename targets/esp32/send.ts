/**
 * Compile a Field IR program to bytecode and send it to the ESP32 sketch (sketch/main.cpp):
 * HTTP `POST /program` (bytecode as hex text) or a serial port as `P <hex>\n` lines; `--data` sets keys.
 *
 *   npx tsx targets/esp32/send.ts --host 192.168.1.70 --ir ripple
 *   npx tsx targets/esp32/send.ts --serial COM5 --ir 'fract(u * 4 + t)' --data '{"value":0.6}'
 *   npx tsx targets/esp32/send.ts --ir plasma --out plasma.dvb      # just write the bytecode
 * Serial: set the port to 115200 8N1 first (`mode COM5 BAUD=115200` / `stty -F /dev/ttyUSB0 115200 raw`).
 */
import { writeFileSync } from 'node:fs'
import { request } from 'node:http'
import { pathToFileURL } from 'node:url'
import { bytecodeInfo, compileBytecode, parse } from '../../src/engine/ir'
import { args, PROGRAMS } from '../lib/frame'

export const programBytes = (src: string) => compileBytecode(parse(PROGRAMS[src] ?? src))
export const serialLines = (code: Uint8Array, data: Record<string, number> = {}) =>
  [`P ${Buffer.from(code).toString('hex')}`, ...Object.entries(data).map(([k, v]) => `D ${k} ${v}`)].map(l => `${l}\n`).join('')

export function httpPost(host: string, path: string, body: string, port = 80): Promise<number> {
  return new Promise((res, rej) => {
    const r = request({ host, port, path, method: 'POST', headers: { 'content-type': 'text/plain', 'content-length': Buffer.byteLength(body) } }, s => { s.resume(); s.on('end', () => res(s.statusCode ?? 0)) })
    r.on('error', rej); r.setTimeout(5000, () => r.destroy(new Error('timeout')))
    r.end(body)
  })
}

/** HTTP: program as hex text (`POST /program`), then each data key as `POST /data?key=value`. Returns the status codes. */
export async function sendHTTP(host: string, code: Uint8Array, data: Record<string, number> = {}, port = 80): Promise<number[]> {
  const out = [await httpPost(host, '/program', Buffer.from(code).toString('hex'), port)]
  for (const [k, v] of Object.entries(data)) out.push(await httpPost(host, `/data?${encodeURIComponent(k)}=${v}`, '', port))
  return out
}

async function main() {
  const a = args()
  if (!a.ir) { console.error('usage: send.ts --ir <name|source> (--host <ip> | --serial <port> | --out file) [--data json]'); process.exit(2) }
  const code = programBytes(a.ir), info = bytecodeInfo(code), data = a.data ? JSON.parse(a.data) as Record<string, number> : {}
  console.log(`program: ${info.bytes} B (${info.constants} f32 constants, ${info.locals} locals, stack ${info.stack}, ≤ ${info.steps} steps/dot, data ${info.data.join(', ') || '-'})`)
  if (a.out) writeFileSync(a.out, code)
  if (a.host) console.log('HTTP', await sendHTTP(a.host, code, data, a.port ? +a.port : 80))
  if (a.serial) { writeFileSync(process.platform === 'win32' && !a.serial.startsWith('\\\\') ? `\\\\.\\${a.serial}` : a.serial, serialLines(code, data)); console.log(`serial → ${a.serial}`) }
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) void main()
