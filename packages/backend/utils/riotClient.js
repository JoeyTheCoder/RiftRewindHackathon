const axios = require('axios');

const PLATFORM_BY_REGION = {
  NA: 'na1', BR: 'br1', LAN: 'la1', LAS: 'la2', OCE: 'oc1',
  EUW: 'euw1', EUNE: 'eun1', TR: 'tr1', RU: 'ru', KR: 'kr', JP: 'jp1'
};
const REGIONAL_BY_REGION = {
  NA: 'americas', BR: 'americas', LAN: 'americas', LAS: 'americas', OCE: 'americas',
  EUW: 'europe', EUNE: 'europe', TR: 'europe', RU: 'europe', KR: 'asia', JP: 'asia'
};

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function jitter(base) { return base * (0.5 + Math.random()); }

function createRiotClient({ apiKey, logger, maxConcurrency = 5 }) {
  if (!apiKey) throw new Error('Riot API key missing');

  const instance = axios.create({ timeout: 15000 });

  // Simple semaphore for concurrency
  let inFlight = 0;
  const queue = [];
  async function withConcurrency(fn) {
    if (inFlight >= maxConcurrency) {
      await new Promise(resolve => queue.push(resolve));
    }
    inFlight++;
    try {
      return await fn();
    } finally {
      inFlight--;
      const next = queue.shift();
      if (next) next();
    }
  }

  async function request(url, opts = {}) {
    return withConcurrency(async () => {
      let attempt = 0;
      let backoff = 500; // ms
      while (attempt < 7) {
        attempt++;
        try {
          const res = await instance.request({
            url,
            method: 'GET',
            headers: { 'X-Riot-Token': apiKey, ...(opts.headers || {}) },
            validateStatus: () => true
          });
          const code = res.status;
          if (code === 200) return res.data;
          if (code === 429) {
            const retryAfter = Number(res.headers['retry-after']);
            const wait = isNaN(retryAfter) ? jitter(backoff) : retryAfter * 1000;
            logger?.warn({ code, attempt }, 'Riot 429 throttled, backing off');
            await sleep(wait);
            backoff = Math.min(backoff * 2, 16000);
            continue;
          }
          if (code >= 500 && code < 600) {
            logger?.warn({ code, attempt }, 'Riot 5xx, retrying');
            await sleep(jitter(backoff));
            backoff = Math.min(backoff * 2, 16000);
            continue;
          }
          const err = new Error(`Riot request failed (${code})`);
          err.code = `RIOT_${code}`;
          err.details = res.data;
          throw err;
        } catch (e) {
          if (e.response) throw e; // handled above
          if (attempt >= 7) throw e;
          logger?.warn({ attempt, err: e.message }, 'Network error, retrying');
          await sleep(jitter(backoff));
          backoff = Math.min(backoff * 2, 16000);
        }
      }
      throw new Error('Exhausted retries');
    });
  }

  function regionMaps(region) {
    const REG = (region || '').toUpperCase();
    const platform = PLATFORM_BY_REGION[REG];
    const regional = REGIONAL_BY_REGION[REG];
    if (!platform || !regional) {
      const e = new Error(`Unsupported region '${region}'`);
      e.code = 'UNSUPPORTED_REGION';
      throw e;
    }
    return { platform, regional };
  }

  return {
    async getAccountByRiotId(region, gameName, tagLine) {
      const { regional } = regionMaps(region);
      const nameEnc = encodeURIComponent(gameName);
      const tagEnc = encodeURIComponent(tagLine);
      const url = `https://${regional}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${nameEnc}/${tagEnc}`;
      return request(url);
    },
    async getSummonerByPuuid(region, puuid) {
      const { platform } = regionMaps(region);
      const url = `https://${platform}.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${puuid}`;
      return request(url);
    },
    async getMatchIds(region, puuid, count) {
      const { regional } = regionMaps(region);
      const url = `https://${regional}.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?type=ranked&start=0&count=${count}`;
      return request(url);
    },
    async getMatch(region, matchId) {
      const { regional } = regionMaps(region);
      const url = `https://${regional}.api.riotgames.com/lol/match/v5/matches/${matchId}`;
      return request(url);
    }
  };
}

module.exports = { createRiotClient };


