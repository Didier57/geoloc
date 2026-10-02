const cache = new Map();

let chain = Promise.resolve();
let lastCall = 0;

function schedule(task) {
  const result = chain.then(async () => {
    const wait = Math.max(0, 1100 - (Date.now() - lastCall));
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    lastCall = Date.now();
    return task();
  });
  chain = result.catch(() => {});
  return result;
}

export async function reverseGeocode(lat, lng) {
  const key = `${Number(lat).toFixed(5)},${Number(lng).toFixed(5)}`;
  if (cache.has(key)) return cache.get(key);

  const params = new URLSearchParams({
    format: 'jsonv2',
    lat: String(lat),
    lon: String(lng),
    zoom: '18',
    'accept-language': 'fr',
  });

  const address = await schedule(async () => {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?${params.toString()}`, {
      headers: {
        'User-Agent': 'geoloc-app/1.0 (https://github.com/Didier57/geoloc)',
        Accept: 'application/json',
      },
    });
    if (!res.ok) throw new Error(`Nominatim a répondu ${res.status}`);
    const data = await res.json();
    return data?.display_name || null;
  });

  cache.set(key, address);
  return address;
}

export async function searchPlaces(query) {
  const q = String(query || '').trim();
  if (q.length < 3) return [];
  const key = `search:${q.toLowerCase()}`;
  if (cache.has(key)) return cache.get(key);

  const params = new URLSearchParams({
    format: 'jsonv2',
    q,
    limit: '8',
    'accept-language': 'fr',
  });

  const results = await schedule(async () => {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
      headers: {
        'User-Agent': 'geoloc-app/1.0 (https://github.com/Didier57/geoloc)',
        Accept: 'application/json',
      },
    });
    if (!res.ok) throw new Error(`Nominatim a répondu ${res.status}`);
    const data = await res.json();
    return (Array.isArray(data) ? data : [])
      .map((item) => ({
        name: item.display_name || item.name || '',
        latitude: Number(item.lat),
        longitude: Number(item.lon),
      }))
      .filter(
        (item) =>
          item.name && Number.isFinite(item.latitude) && Number.isFinite(item.longitude),
      );
  });

  cache.set(key, results);
  return results;
}
