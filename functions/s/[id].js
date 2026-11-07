// /s/<session id>: the normal page, but with link-preview tags (Discord, Slack, X...)
// for that one session. The page itself reads the id from the URL and opens it.
// Preview images are pre-rendered by og/sessions.mjs into public/og/s/; a session
// without one (added after the last deploy) falls back to the site-wide og.png.
// /s/<session id>.ics is that session as a calendar file (see src/calendar.js).
import '../../public/model.js';
import { getSession } from '../../src/sessions.js';
import { sessionIcs, icsFileName } from '../../src/calendar.js';

const SITE = 'TwitchCon San Diego 2026 schedule';

export async function onRequest({ request, env, params }) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
  }
  const url = new URL(request.url);
  const id = String(params.id || '');
  if (id.endsWith('.ics')) return calendarFile(env, url, id.slice(0, -4));

  const page = await env.ASSETS.fetch(new URL('/', url));
  if (!page.ok) return page;

  let s = null;
  try {
    s = await getSession(env, id);
  } catch (err) {
    console.error('session lookup failed:', String(err));
  }
  if (!s) return page; // unknown id: plain page, which then drops the id from the URL

  const p = globalThis.TCModel.preview(s);
  const link = url.origin + '/s/' + encodeURIComponent(s.id);

  let image = url.origin + '/og.png', type = 'image/png';
  try {
    const img = await env.ASSETS.fetch(new Request(new URL('/' + p.image, url), { method: 'HEAD' }));
    // missing assets come back as the HTML page, so check the type rather than the status
    if (img.ok && (img.headers.get('content-type') || '').startsWith('image/')) {
      image = url.origin + '/' + p.image;
      type = 'image/jpeg';
    }
  } catch (err) {
    console.error('preview image check failed:', String(err));
  }

  const alt = p.title + ', ' + p.dayShort + ' ' + p.time + ', ' + p.room;
  const set = (attr, value) => ({ element(el) { el.setAttribute(attr, value); } });
  const out = new HTMLRewriter()
    .on('title', { element(el) { el.setInnerContent(p.title + ' - ' + SITE); } })
    .on('meta[name="description"]', set('content', p.description))
    .on('link[rel="canonical"]', set('href', link))
    .on('meta[property="og:url"]', set('content', link))
    .on('meta[property="og:title"]', set('content', p.title))
    .on('meta[property="og:description"]', set('content', p.description))
    .on('meta[property="og:image"]', set('content', image))
    .on('meta[property="og:image:type"]', set('content', type))
    .on('meta[property="og:image:alt"]', set('content', alt))
    .on('meta[name="twitter:title"]', set('content', p.title))
    .on('meta[name="twitter:description"]', set('content', p.description))
    .on('meta[name="twitter:image"]', set('content', image))
    .transform(page);

  const res = new Response(out.body, out);
  res.headers.delete('etag');
  res.headers.set('cache-control', 'public, max-age=300');
  return res;
}

// /s/<session id>.ics: that one session as a calendar event ("Add to calendar" in the panel)
async function calendarFile(env, url, id) {
  let s = null;
  try {
    s = await getSession(env, id);
  } catch (err) {
    console.error('session lookup failed:', String(err));
    return new Response('Could not load the schedule. Try again in a minute.', { status: 502, headers: { 'cache-control': 'no-store' } });
  }
  if (!s) return new Response('No session with that id.', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } });

  const link = url.origin + '/s/' + encodeURIComponent(s.id);
  return new Response(sessionIcs(s, link), {
    headers: {
      'content-type': 'text/calendar; charset=utf-8',
      'content-disposition': 'attachment; filename="' + icsFileName(s) + '"',
      'cache-control': 'public, max-age=300',
      'x-content-type-options': 'nosniff',
    },
  });
}
