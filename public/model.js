/*
 * Shared schedule model: rooms, areas, title clean-up and link-preview text.
 * Used by the page (public/index.html), the link-preview Pages Function
 * (functions/s/[id].js) and the preview-image renderer (og/sessions.mjs).
 * Plain script that sets globalThis.TCModel, so it works in all three.
 */
(function (root) {
  'use strict';

  var SD_TZ = 'America/Los_Angeles';

  var ZONES = [
    { id: 'podia', name: 'Stages', rooms: ['GivePLZ Stage', 'PJSugar Stage', 'Kappa Cabana Stage', 'DinoDance', 'Minecraft Stage', 'Twitch Rivals Arena', 'Glitch Theater'] },
    { id: 'theaters', name: 'Theaters and LAN', rooms: ['NomNom Theater', 'Riot Games Theater', 'Space Jam Half-Court', 'LAN'] },
    { id: 'camp', name: 'Creator Camp', rooms: ['Creator Camp Panels', 'Creator Camp Tools', 'Creator Camp Roundtables', 'Creator Camp Partner Lounge'] },
    { id: 'workshops', name: 'Workshops', rooms: ['CoolCat Workshops', 'FrankerZ Workshops'] },
    { id: 'community', name: 'Community', rooms: ['Community MeetUps 1', 'Community MeetUps 2', 'The Unity Lounge'] },
    { id: 'tabletop', name: 'Tabletop', rooms: ['Tabletop All Day Events', 'Board Games', 'Trading Card Games', 'Magic: The Gathering', 'Pokémon Bingo', 'D&D Intro', 'D&D Adventure Box', 'D&D Experienced', 'Chess', 'Tabletop general'] },
    { id: 'meetgreet', name: 'Meet & Greet', rooms: ['Meet & Greet 1', 'Meet & Greet 2', 'Meet & Greet 3', 'Meet & Greet 4', 'Meet & Greet 5', 'Meet & Greet 6', 'Meet & Greet 7', 'Meet & Greet other'] },
    { id: 'overig', name: 'Other', rooms: ['Partner Party'] }
  ];
  var ROOM_ZONE = {}, ZONE_NAME = {};
  ZONES.forEach(function (z) { ZONE_NAME[z.id] = z.name; z.rooms.forEach(function (r) { ROOM_ZONE[r] = z.id; }); });

  var TABLETOP_MAP = {
    'Board Games': 'Board Games',
    'Trading Card Games': 'Trading Card Games',
    'Magic: The Gathering': 'Magic: The Gathering',
    'Pokemon Bingo': 'Pokémon Bingo',
    'Pokémon Bingo': 'Pokémon Bingo',
    'Dungeons & Dragons Intro': 'D&D Intro', 'D&D Intro': 'D&D Intro',
    'Dungeons & Dragons Adventure Box': 'D&D Adventure Box', 'D&D Adventure Box': 'D&D Adventure Box',
    'Dungeons & Dragons Experienced': 'D&D Experienced', 'D&D Experienced': 'D&D Experienced',
    'Chess': 'Chess', 'Grandmaster Chess': 'Chess',
    'All Day Events': 'Tabletop All Day Events'
  };

  function roomOf(loc) {
    var l = loc.replace(/\s+/g, ' ').trim();
    var m = l.match(/^Meet\s*&\s*Greet\s*-\s*(\d+)$/i);
    if (m) return 'Meet & Greet ' + m[1];
    if (/^Meet\s*&\s*Greet$/i.test(l)) return 'Meet & Greet other';
    if (/^Kappa Cabana/i.test(l)) return 'Kappa Cabana Stage';
    if (/^Twitch Rivals Arena/i.test(l)) return 'Twitch Rivals Arena';
    if (/^Space Jam/i.test(l)) return 'Space Jam Half-Court';
    if (/^San Diego Convention Center$/i.test(l)) return 'Partner Party';
    if (/^Tabletop$/i.test(l)) return 'Tabletop general';
    var t = l.replace(/^Tabletop\s+/i, '');
    return TABLETOP_MAP[t] || l;
  }

  function cleanTitle(raw, program, speakers) {
    var t = raw.trim();
    if (program === 'Meet & Greet') {
      t = t.replace(/^(.*?Meet\s*&\s*Greet)\s*\|\s*/i, function (m, a) { return /^VTuber/i.test(a) ? 'VTuber: ' : ''; });
      if (!t || /\d{1,2}:\d{2}\s*(AM|PM)/i.test(t)) {
        t = speakers.length ? 'Meet & Greet with ' + speakers.length + ' streamers' : 'Meet & Greet';
      }
    }
    return t.replace(/\s+/g, ' ').trim();
  }

  // Bump when og/session.html changes, so every preview image gets a new URL
  // (Discord caches images by URL) and og/sessions.mjs re-renders them all.
  var IMAGE_VERSION = 2;

  // FNV-1a, 32 bit: a short fingerprint so changed sessions get a new preview image URL
  function fingerprint(str) {
    var h = 0x811c9dc5;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return ('0000000' + h.toString(16)).slice(-8);
  }

  var fmtTime = new Intl.DateTimeFormat('en-GB', { timeZone: SD_TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  var fmtDayLong = new Intl.DateTimeFormat('en-GB', { timeZone: SD_TZ, weekday: 'long', day: 'numeric', month: 'long' });
  var fmtDayShort = new Intl.DateTimeFormat('en-GB', { timeZone: SD_TZ, weekday: 'long', day: 'numeric', month: 'short' });

  function listNames(names, max) {
    if (!names.length) return '';
    var shown = names.slice(0, max);
    var more = names.length - shown.length;
    if (more > 0) return shown.join(', ') + ' +' + more + ' more';
    if (shown.length === 1) return shown[0];
    return shown.slice(0, -1).join(', ') + ' and ' + shown[shown.length - 1];
  }

  /** Everything a link preview or preview image needs for one trimmed API session. */
  function preview(r) {
    var room = roomOf(r.l);
    var zone = ROOM_ZONE[room] || 'overig';
    var title = cleanTitle(r.t, r.p, r.sp);
    var start = new Date(r.s), end = new Date(r.e);
    var time = fmtTime.format(start) + '–' + fmtTime.format(end);
    var dayShort = fmtDayShort.format(start);
    var desc = dayShort + ', ' + time + ' San Diego time · ' + room +
      (r.sp.length ? ' · with ' + listNames(r.sp, 4) : '') +
      '. TwitchCon San Diego 2026 schedule, as a timeline.';
    return {
      id: r.id,
      title: title,
      room: room,
      zone: zone,
      zoneName: ZONE_NAME[zone],
      dayLong: fmtDayLong.format(start),
      dayShort: dayShort,
      time: time,
      speakers: r.sp.slice(),
      speakerText: listNames(r.sp, 5),
      description: desc,
      image: 'og/s/' + r.id + '-' + fingerprint(JSON.stringify([IMAGE_VERSION, title, room, r.s, r.e, r.sp, r.p])) + '.jpg'
    };
  }

  root.TCModel = {
    SD_TZ: SD_TZ,
    zones: function () { return JSON.parse(JSON.stringify(ZONES)); },
    roomOf: roomOf,
    cleanTitle: cleanTitle,
    preview: preview
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
