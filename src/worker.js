/**
 * TwitchCon San Diego 2026 schedule viewer: background refresher.
 *
 * The site itself is the Pages project (public/ + functions/) on tc.jasper.stream.
 * This Worker has no public URL; it only runs the cron that copies the TwitchCon
 * sessions API into KV every 5 minutes, so visitors never wait on TwitchCon.
 */

import { refresh, REFRESH_UNTIL } from './sessions.js';

export default {
  async scheduled(event, env, ctx) {
    if (Date.now() > REFRESH_UNTIL) return;
    await refresh(env);
  },
};
