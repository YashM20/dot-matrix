/** `GET /api/likes/p/<64 hex>` (#169): one program's like count, cached at the CDN. See `../../_lib/routes.ts`. */
import { entry } from '../../_lib/deps.js'

export default entry('program')
