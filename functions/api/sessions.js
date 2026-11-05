// Pages Function for the Cloudflare Pages copy of the site (tc.jasper.stream).
// It reads the same KV store that the Worker's 5-minute cron keeps fresh.
import { serveSessions } from '../../src/sessions.js';

export function onRequest({ request, env, waitUntil }) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
  }
  return serveSessions(env, { waitUntil });
}
