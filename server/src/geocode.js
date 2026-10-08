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

const PHOTON_URL = 'https://photon.komoot.io/api/';
const NOMINATIM_SEARCH_URL = 'https://nominatim.openstreetmap.org/search';

const GEOCODE_HEADERS = {
  'User-Agent': 'geoloc-app/1.0 (https://github.com/Didier57/geoloc)',
  Accept: 'application/json',
};

const PLACE_LABELS = {
  restaurant: 'Restaurant',
  cafe: 'Café',
  bar: 'Bar',
  pub: 'Pub',
  fast_food: 'Restauration rapide',
  bakery: 'Boulangerie',
  convenience: 'Épicerie',
  supermarket: 'Supermarché',
  marketplace: 'Marché',
  greengrocer: 'Primeur',
  butcher: 'Boucherie',
  hairdresser: 'Coiffeur',
  clothes: 'Vêtements',
  shoes: 'Chaussures',
  jewelry: 'Bijouterie',
  florist: 'Fleuriste',
  books: 'Librairie',
  electronics: 'Électronique',
  mobile_phone: 'Téléphonie',
  computer: 'Informatique',
  hardware: 'Bricolage',
  furniture: 'Ameublement',
  optician: 'Opticien',
  car: 'Automobile',
  car_repair: 'Garage',
  bicycle: 'Vélos',
  fuel: 'Station-service',
  bank: 'Banque',
  pharmacy: 'Pharmacie',
  post_office: 'Bureau de poste',
  hospital: 'Hôpital',
  clinic: 'Clinique',
  doctors: 'Médecin',
  dentist: 'Dentiste',
  veterinary: 'Vétérinaire',
  school: 'École',
  university: 'Université',
  library: 'Bibliothèque',
  kindergarten: 'Crèche',
  cinema: 'Cinéma',
  theatre: 'Théâtre',
  museum: 'Musée',
  hotel: 'Hôtel',
  hostel: 'Auberge',
  guest_house: "Maison d'hôtes",
  camp_site: 'Camping',
  attraction: 'Attraction',
  viewpoint: 'Point de vue',
  park: 'Parc',
  sports_centre: 'Centre sportif',
  fitness_centre: 'Salle de sport',
  swimming_pool: 'Piscine',
  place_of_worship: 'Lieu de culte',
  company: 'Société',
  office: 'Bureau',
  industrial: 'Site industriel',
  warehouse: 'Entrepôt',
  retail: 'Commerce',
  commercial: 'Bâtiment commercial',
  apartments: 'Immeuble',
  residential: 'Bâtiment',
  house: 'Maison',
  church: 'Église',
  tourism: 'Tourisme',
  information: 'Information',
  toilets: 'Toilettes',
  drinking_water: "Point d'eau",
  parking: 'Parking',
  bus_station: 'Gare routière',
  railway: 'Gare',
  aerodrome: 'Aérodrome',
};

function placeKindLabel(value) {
  if (!value || value === 'yes' || value === 'no') return '';
  const key = String(value).toLowerCase();
  if (PLACE_LABELS[key]) return PLACE_LABELS[key];
  return key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' ');
}

function photonLabel(properties) {
  if (!properties) return '';
  const parts = properties.name
    ? [properties.name, properties.city, properties.country]
    : [
        [properties.housenumber, properties.street].filter(Boolean).join(' ') ||
          properties.city,
        properties.postcode,
        properties.country,
      ];
  return parts
    .filter(Boolean)
    .filter((value, index, list) => list.indexOf(value) === index)
    .join(', ');
}

async function photonSearch(query, lat, lng) {
  const params = new URLSearchParams({ q: query, limit: '12', lang: 'fr' });
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    params.set('lat', String(lat));
    params.set('lon', String(lng));
  }
  const res = await fetch(`${PHOTON_URL}?${params.toString()}`, { headers: GEOCODE_HEADERS });
  if (!res.ok) throw new Error(`Photon a répondu ${res.status}`);
  const data = await res.json();
  const features = Array.isArray(data?.features) ? data.features : [];
  return features
    .map((feature) => {
      const coordinates = feature.geometry?.coordinates || [];
      return {
        name: photonLabel(feature.properties),
        kind: placeKindLabel(feature.properties?.osm_value),
        latitude: Number(coordinates[1]),
        longitude: Number(coordinates[0]),
      };
    })
    .filter(
      (item) => item.name && Number.isFinite(item.latitude) && Number.isFinite(item.longitude),
    );
}

async function nominatimSearch(query, lat, lng) {
  const params = new URLSearchParams({
    format: 'jsonv2',
    q: query,
    limit: '10',
    addressdetails: '1',
    dedupe: '1',
    'accept-language': 'fr',
  });
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    const d = 0.25;
    params.set('viewbox', `${lng - d},${lat + d},${lng + d},${lat - d}`);
    params.set('bounded', '0');
  }
  const res = await fetch(`${NOMINATIM_SEARCH_URL}?${params.toString()}`, {
    headers: GEOCODE_HEADERS,
  });
  if (!res.ok) throw new Error(`Nominatim a répondu ${res.status}`);
  const data = await res.json();
  return (Array.isArray(data) ? data : [])
    .map((item) => ({
      name: item.display_name,
      kind: placeKindLabel(item.type),
      latitude: Number(item.lat),
      longitude: Number(item.lon),
    }))
    .filter(
      (item) => item.name && Number.isFinite(item.latitude) && Number.isFinite(item.longitude),
    );
}

export async function searchPlaces(query, { lat, lng } = {}) {
  const q = String(query || '').trim();
  if (q.length < 3) return [];

  const biasLat = Number(lat);
  const biasLng = Number(lng);
  const hasBias = Number.isFinite(biasLat) && Number.isFinite(biasLng);
  const key = `search:${hasBias ? `${biasLat.toFixed(2)},${biasLng.toFixed(2)}:` : ''}${q.toLowerCase()}`;
  if (cache.has(key)) return cache.get(key);

  let results = [];
  try {
    results = await schedule(() => photonSearch(q, biasLat, biasLng));
  } catch {
    results = [];
  }
  if (results.length === 0) {
    try {
      results = await schedule(() => nominatimSearch(q, biasLat, biasLng));
    } catch {
      results = [];
    }
  }

  cache.set(key, results);
  return results;
}
