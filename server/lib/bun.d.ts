// Type definitions for `api-ape/bun`
import type { ApeServerOptions, ApeBunHandlers } from '../../index'

/**
 * Create api-ape handlers for `Bun.serve()`.
 *
 * @example
 * import { apeBun } from 'api-ape/bun'
 * const ape = apeBun({ where: 'api', selector: ['js', 'ts'] })
 * Bun.serve({ port: 3000, fetch: (req, srv) => ape.fetch(req, srv) ?? new Response('Not found', { status: 404 }), websocket: ape.websocket })
 */
export declare function apeBun(options: ApeServerOptions): ApeBunHandlers
