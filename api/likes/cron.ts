/** `GET /api/likes/cron` (#169): the daily job (Vercel Cron, `Authorization: Bearer $CRON_SECRET`). See `../_lib/likes.ts` `daily`. */
import { entry } from '../_lib/deps.js'

export default entry('cron')
