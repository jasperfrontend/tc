// One session as an iCalendar (.ics) file, for "Add to calendar" in the session panel.
// Served by functions/s/[id].js at /s/<id>.ics. Google, Apple and Outlook calendars all
// import it. Times are in UTC, so each calendar shows them in the viewer's own time zone.
import '../public/model.js';

const VENUE = 'San Diego Convention Center';

/** The .ics text for one trimmed API session; `link` is its /s/<id> page. */
export function sessionIcs(s, link, now = Date.now()) {
  const p = globalThis.TCModel.preview(s);
  const description = [
    s.d,
    s.sp.length ? (s.sp.length > 1 ? 'Streamers: ' : 'Streamer: ') + s.sp.join(', ') : '',
    'Details and what else is on: ' + link,
  ].filter(Boolean).join('\n\n');

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//tc.jasper.stream//TwitchCon San Diego 2026 schedule//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    'UID:' + s.id + '@tc.jasper.stream',
    'DTSTAMP:' + utc(now),
    'DTSTART:' + utc(s.s),
    'DTEND:' + utc(s.e),
    'SUMMARY:' + text(p.title),
    'LOCATION:' + text(p.room === 'Partner Party' ? VENUE : p.room + ', ' + VENUE),
    'DESCRIPTION:' + text(description),
    'URL:' + link,
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.map(fold).join('\r\n') + '\r\n';
}

/** A file name for the download: the title in plain lowercase words. */
export function icsFileName(s) {
  const title = globalThis.TCModel.preview(s).title;
  const slug = title.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '');
  return (slug || 'session') + '.ics';
}

// 20261113T180000Z
function utc(ms) {
  return new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

// RFC 5545 TEXT: escape backslash, semicolon, comma and newlines
function text(v) {
  return String(v).replace(/\r\n?/g, '\n').replace(/[\\;,]/g, (c) => '\\' + c).replace(/\n/g, '\\n');
}

// Lines may be at most 75 bytes; continue with CRLF + space, never inside a UTF-8 character
function fold(line) {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const out = [];
  let cur = '', bytes = 0, limit = 75;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    if (bytes + n > limit) {
      out.push(cur);
      cur = ''; bytes = 0; limit = 74; // continuation lines start with a space
    }
    cur += ch; bytes += n;
  }
  out.push(cur);
  return out.join('\r\n ');
}
