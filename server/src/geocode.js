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
