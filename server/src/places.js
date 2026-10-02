import { haversineKm } from './motion.js';

const DEFAULT_MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter',
  'https://z.overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

const OVERPASS_MIRRORS = [
  ...(process.env.OVERPASS_URL ? [process.env.OVERPASS_URL] : []),
  ...DEFAULT_MIRRORS,
].filter((url, index, list) => list.indexOf(url) === index);

const REQUEST_TIMEOUT_MS = 10000;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_RESULTS = 60;

const GEOAPIFY_KEY = process.env.GEOAPIFY_KEY || '';
const GEOAPIFY_URL = 'https://api.geoapify.com/v2/places';
let lastGeoapifyRaw = null;
const GEOAPIFY_CATEGORY_LIST = [
  'catering',
  'commercial',
  'healthcare',
  'education',
  'accommodation',
  'tourism',
  'entertainment',
  'leisure',
  'service',
  'office',
  'religion',
  'heritage',
  'sport',
  'parking',
  'public_transport',
  'activity',
  'pet',
  'production',
  'building',
];
const GEOAPIFY_CATEGORIES = GEOAPIFY_CATEGORY_LIST.join(',');

const GEOAPIFY_LABELS = {
  restaurant: 'Restaurant',
  cafe: 'Café',
  bar: 'Bar',
  pub: 'Pub',
  fast_food: 'Restauration rapide',
  food_court: 'Restauration rapide',
  bakery: 'Boulangerie',
  butcher: 'Boucherie',
  greengrocer: 'Primeur',
  ice_cream: 'Glacier',
  confectionery: 'Confiserie',
  supermarket: 'Supermarché',
  convenience: 'Épicerie',
  marketplace: 'Marché',
  mall: 'Centre commercial',
  department_store: 'Grand magasin',
  clothes: 'Vêtements',
  shoes: 'Chaussures',
  jewelry: 'Bijouterie',
  florist: 'Fleuriste',
  books: 'Librairie',
  electronics: 'Électronique',
  hardware: 'Bricolage',
  furniture: 'Ameublement',
  optician: 'Opticien',
  hairdresser: 'Coiffeur',
  beauty: 'Beauté',
  bank: 'Banque',
  atm: 'Distributeur',
  pharmacy: 'Pharmacie',
  hospital: 'Hôpital',
  clinic: 'Clinique',
  dentist: 'Dentiste',
  doctors: 'Médecin',
  veterinary: 'Vétérinaire',
  fuel: 'Station-service',
  charging_station: 'Borne de recharge',
  post_office: 'Bureau de poste',
  police: 'Police',
  fire_station: 'Pompiers',
  townhall: 'Mairie',
  school: 'École',
  kindergarten: 'Crèche',
  college: 'Collège',
  university: 'Université',
  library: 'Bibliothèque',
  cinema: 'Cinéma',
  theatre: 'Théâtre',
  nightclub: 'Discothèque',
  casino: 'Casino',
  arts_centre: 'Centre culturel',
  community_centre: 'Centre social',
  place_of_worship: 'Lieu de culte',
  hotel: 'Hôtel',
  motel: 'Motel',
  hostel: 'Auberge',
  guest_house: "Maison d'hôtes",
  apartment: 'Appartement',
  museum: 'Musée',
  gallery: 'Galerie',
  attraction: 'Attraction',
  viewpoint: 'Point de vue',
  park: 'Parc',
  garden: 'Jardin',
  playground: 'Aire de jeux',
  sports_centre: 'Centre sportif',
  fitness_centre: 'Salle de sport',
  stadium: 'Stade',
  swimming_pool: 'Piscine',
  golf_course: 'Golf',
  marina: 'Marina',
  car_repair: 'Garage',
  car: 'Automobile',
  bicycle: 'Vélos',
  company: 'Entreprise',
  office: 'Bureau',
  industrial: 'Site industriel',
  warehouse: 'Entrepôt',
  building: 'Bâtiment',
  commercial: 'Commerce',
  healthcare: 'Santé',
  education: 'Enseignement',
  accommodation: 'Hébergement',
  catering: 'Restauration',
  entertainment: 'Divertissement',
  leisure: 'Loisirs',
  heritage: 'Patrimoine',
  religion: 'Culte',
  service: 'Service',
  production: 'Production',
  activity: 'Activité',
  pet: 'Animalerie',
  parking: 'Parking',
  public_transport: 'Transport',
};

function geoapifyKind(categories) {
  const list = Array.isArray(categories) ? categories : [];
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const parts = String(list[i]).split('.');
    const leaf = parts[parts.length - 1];
    if (KIND_LABELS[leaf] || GEOAPIFY_LABELS[leaf]) return leaf;
  }
  const first = list[0] ? String(list[0]).split('.')[0] : null;
  return first || null;
}

const AMENITY_VALUES = [
  'restaurant',
  'cafe',
  'bar',
  'pub',
  'fast_food',
  'food_court',
  'ice_cream',
  'biergarten',
  'bakery',
  'butcher',
  'cheese',
  'confectionery',
  'deli',
  'greengrocer',
  'seafood',
  'supermarket',
  'convenience',
  'grocery',
  'marketplace',
  'bank',
  'atm',
  'bureau_de_change',
  'pharmacy',
  'hospital',
  'clinic',
  'doctors',
  'dentist',
  'veterinary',
  'fuel',
  'charging_station',
  'car_wash',
  'car_rental',
  'post_office',
  'police',
  'fire_station',
  'townhall',
  'school',
  'kindergarten',
  'college',
  'university',
  'library',
  'cinema',
  'theatre',
  'nightclub',
  'casino',
  'arts_centre',
  'community_centre',
  'place_of_worship',
  'drinking_water',
  'toilets',
].join('|');

const TOURISM_VALUES = [
  'hotel',
  'motel',
  'hostel',
  'guest_house',
  'apartment',
  'museum',
  'gallery',
  'attraction',
  'viewpoint',
  'picnic_site',
  'camp_site',
  'theme_park',
  'zoo',
  'artwork',
  'information',
].join('|');

const LEISURE_VALUES = [
  'park',
  'garden',
  'playground',
  'sports_centre',
  'fitness_centre',
  'stadium',
  'pitch',
  'swimming_pool',
  'golf_course',
  'marina',
  'dog_park',
  'nature_reserve',
].join('|');

const KIND_LABELS = {
  restaurant: 'Restaurant',
  cafe: 'Café',
  bar: 'Bar',
  pub: 'Pub',
  fast_food: 'Restauration rapide',
  bakery: 'Boulangerie',
  ice_cream: 'Glacier',
  supermarket: 'Supermarché',
  convenience: 'Épicerie',
  marketplace: 'Marché',
  bank: 'Banque',
  pharmacy: 'Pharmacie',
  fuel: 'Station-service',
  post_office: 'Bureau de poste',
  hospital: 'Hôpital',
  clinic: 'Clinique',
  school: 'École',
  library: 'Bibliothèque',
  cinema: 'Cinéma',
  theatre: 'Théâtre',
  hotel: 'Hôtel',
  guest_house: "Maison d'hôtes",
  hostel: 'Auberge',
  museum: 'Musée',
  attraction: 'Attraction',
  viewpoint: 'Point de vue',
  park: 'Parc',
  sports_centre: 'Centre sportif',
  fitness_centre: 'Salle de sport',
  mall: 'Centre commercial',
  clothes: 'Vêtements',
  hairdresser: 'Coiffeur',
  beauty: 'Beauté',
  car_repair: 'Garage',
  car: 'Automobile',
  bicycle: 'Vélos',
  florist: 'Fleuriste',
  butcher: 'Boucherie',
  books: 'Librairie',
  electronics: 'Électronique',
  hardware: 'Bricolage',
  furniture: 'Ameublement',
  optician: 'Opticien',
  dentist: 'Dentiste',
  doctors: 'Médecin',
  veterinary: 'Vétérinaire',
  place_of_worship: 'Lieu de culte',
  toilets: 'Toilettes publiques',
  drinking_water: "Point d'eau",
  ticket: 'Billetterie',
  kiosk: 'Kiosque',
  newsagent: 'Presse',
  stationery: 'Papeterie',
  gift: 'Cadeaux',
  jewelry: 'Bijouterie',
  shoes: 'Chaussures',
  sports: 'Articles de sport',
  toys: 'Jouets',
  pet: 'Animalerie',
  tobacco: 'Bureau de tabac',
  alcohol: 'Cave à vins',
  department_store: 'Grand magasin',
  variety_store: 'Bazar',
  travel_agency: 'Agence de voyages',
  estate_agent: 'Agence immobilière',
  insurance: 'Assurance',
  mobile_phone: 'Téléphonie',
  computer: 'Informatique',
  photo: 'Photographie',
  laundry: 'Pressing',
  dry_cleaning: 'Pressing',
  company: 'Entreprise',
  office: 'Bureau',
  industrial: 'Site industriel',
  warehouse: 'Entrepôt',
  retail: 'Commerce',
  commercial: 'Bâtiment commercial',
  apartments: 'Immeuble',
  residential: 'Bâtiment',
  house: 'Maison',
  church: 'Église',
  university: 'Université',
};

const cache = new Map();

const MAX_CONCURRENT = 4;
let active = 0;
const waiting = [];

function withLimit(task) {
  return new Promise((resolve, reject) => {
    const run = () => {
      active += 1;
      task()
        .then(resolve, reject)
        .finally(() => {
          active -= 1;
          const next = waiting.shift();
          if (next) next();
        });
    };
    if (active < MAX_CONCURRENT) run();
    else waiting.push(run);
  });
}

function buildQuery(lat, lng, radius) {
  const around = `(around:${radius},${lat},${lng})`;
  return `[out:json][timeout:25];
(
  nwr${around}["name"]["amenity"~"^(${AMENITY_VALUES})$"];
  nwr${around}["name"]["shop"];
  nwr${around}["name"]["tourism"~"^(${TOURISM_VALUES})$"];
  nwr${around}["name"]["leisure"~"^(${LEISURE_VALUES})$"];
  nwr${around}["office"];
  nwr${around}["healthcare"];
  nwr${around}["craft"];
  nwr${around}["historic"];
  nwr${around}["name"]["building"];
  nwr${around}["name"]["industrial"];
  nwr${around}["name"]["landuse"];
);
out center ${MAX_RESULTS};`;
}

function kindOf(tags) {
  return (
    tags.amenity ||
    tags.shop ||
    tags.tourism ||
    tags.leisure ||
    tags.healthcare ||
    tags.craft ||
    tags.historic ||
    tags.office ||
    tags.building ||
    tags.industrial ||
    tags.landuse ||
    null
  );
}

function labelOf(kind) {
  if (!kind || kind === 'yes' || kind === 'no') return 'Lieu';
  return KIND_LABELS[kind] || GEOAPIFY_LABELS[kind] || kind.replace(/_/g, ' ');
}

function describeError(err) {
  if (err?.name === 'AbortError') return 'délai dépassé';
  const code = err?.cause?.code || err?.code;
  return code ? `${err.message} (${code})` : err?.message || String(err);
}

async function queryMirror(mirror, query, signal) {
  const res = await fetch(mirror, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'geoloc-app/1.0 (https://github.com/Didier57/geoloc)',
      Accept: 'application/json',
    },
    body: `data=${encodeURIComponent(query)}`,
    signal,
  });
  if (!res.ok) throw new Error(`Overpass a répondu ${res.status}`);
  const data = await res.json();
  return (data?.elements || [])
    .map((element) => {
      const latitude = element.lat ?? element.center?.lat;
      const longitude = element.lon ?? element.center?.lon;
      if (!element?.tags?.name || latitude == null || longitude == null) return null;
      const kind = kindOf(element.tags);
      return {
        id: `${element.type}/${element.id}`,
        name: element.tags.name,
        kind,
        label: labelOf(kind),
        latitude,
        longitude,
      };
    })
    .filter(Boolean);
}

function queryMirrors(query) {
  return new Promise((resolve, reject) => {
    if (OVERPASS_MIRRORS.length === 0) {
      reject(new Error('Overpass indisponible'));
      return;
    }

    const controller = new AbortController();
    let pending = OVERPASS_MIRRORS.length;
    let emptyResult = null;
    const errors = [];
    let settled = false;

    const failureMessage = () =>
      errors.length
        ? `Overpass injoignable (${errors.map((e) => `${e.mirror} : ${e.message}`).join(' ; ')})`
        : 'Overpass indisponible';

    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      controller.abort();
      callback(value);
    };

    const timer = setTimeout(() => {
      if (emptyResult) finish(resolve, emptyResult);
      else finish(reject, new Error(failureMessage()));
    }, REQUEST_TIMEOUT_MS);

    for (const mirror of OVERPASS_MIRRORS) {
      queryMirror(mirror, query, controller.signal)
        .then((list) => {
          if (settled) return;
          if (list.length > 0) {
            finish(resolve, list);
            return;
          }
          if (!emptyResult) emptyResult = list;
          pending -= 1;
          if (pending === 0) finish(resolve, emptyResult || []);
        })
        .catch((err) => {
          errors.push({ mirror, message: describeError(err) });
          if (settled) return;
          pending -= 1;
          if (pending === 0) {
            if (emptyResult) finish(resolve, emptyResult);
            else finish(reject, new Error(failureMessage()));
          }
        });
    }
  });
}

export async function checkMirrors(lat, lng, radius = 150) {
  const query = buildQuery(lat, lng, radius);
  const results = [];
  for (const mirror of OVERPASS_MIRRORS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const started = Date.now();
    try {
      const list = await queryMirror(mirror, query, controller.signal);
      results.push({ mirror, ok: true, count: list.length, ms: Date.now() - started });
    } catch (err) {
      results.push({
        mirror,
        ok: false,
        error: describeError(err),
        ms: Date.now() - started,
      });
    } finally {
      clearTimeout(timer);
    }
  }
  return results;
}

function geoapifyStrategies(lat, lng, radius) {
  const base = `${GEOAPIFY_URL}?categories=${GEOAPIFY_CATEGORIES}`;
  const tail = `limit=${MAX_RESULTS}&lang=fr&apiKey=${GEOAPIFY_KEY}`;
  const apiKeyUrl = `${GEOAPIFY_URL}?apiKey=${GEOAPIFY_KEY}`;
  return [
    {
      label: 'post-circle',
      method: 'POST',
      url: apiKeyUrl,
      body: {
        categories: GEOAPIFY_CATEGORY_LIST,
        filter: { type: 'circle', lon: Number(lng), lat: Number(lat), radius: Number(radius) },
        limit: MAX_RESULTS,
        lang: 'fr',
      },
    },
    {
      label: 'post-proximity',
      method: 'POST',
      url: apiKeyUrl,
      body: {
        categories: GEOAPIFY_CATEGORY_LIST,
        bias: { type: 'proximity', lon: Number(lng), lat: Number(lat) },
        limit: MAX_RESULTS,
        lang: 'fr',
      },
    },
    { label: 'bias-circle', method: 'GET', url: `${base}&bias=circle:${lng},${lat},${radius}&${tail}` },
    { label: 'bias-seul', method: 'GET', url: `${base}&bias=proximity:${lng},${lat}&${tail}` },
    {
      label: 'filter+bias',
      method: 'GET',
      url: `${base}&filter=circle:${lng},${lat},${radius}&bias=proximity:${lng},${lat}&${tail}`,
    },
    { label: 'filter-seul', method: 'GET', url: `${base}&filter=circle:${lng},${lat},${radius}&${tail}` },
  ];
}

function geoapifyUrl(lat, lng, radius) {
  return geoapifyStrategies(lat, lng, radius)[0].url;
}

async function requestGeoapifyJson(strategy) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const started = Date.now();
  try {
    const options = {
      method: strategy.method,
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    };
    if (strategy.method === 'POST') {
      options.headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(strategy.body);
    }
    const res = await fetch(strategy.url, options);
    const text = await res.text();
    let data = null;
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
    lastGeoapifyRaw = `${res.ok ? '' : `HTTP ${res.status} `}${text.slice(0, 1000)}`;
    const total = Array.isArray(data?.features) ? data.features.length : 0;
    console.log(
      `[poi] Geoapify ${strategy.label} HTTP ${res.status} : ${total} resultat(s) en ${Date.now() - started} ms`,
    );
    if (!res.ok) throw new Error(`Geoapify a répondu ${res.status}`);
    return data;
  } finally {
    clearTimeout(timer);
  }
}

function mapGeoapify(data, lat, lng, radius) {
  const cap = Number(radius);
  return (data?.features || [])
    .map((feature) => {
      const props = feature?.properties || {};
      const coords = feature?.geometry?.coordinates || [];
      const longitude = props.lon ?? coords[0];
      const latitude = props.lat ?? coords[1];
      const name = props.name || props.address_line1;
      if (!name || latitude == null || longitude == null) return null;
      const distanceM = haversineKm(lat, lng, latitude, longitude) * 1000;
      if (Number.isFinite(cap) && distanceM > cap) return null;
      const kind = geoapifyKind(props.categories);
      return {
        id: props.place_id || `${longitude},${latitude}`,
        name,
        kind,
        label: labelOf(kind),
        latitude,
        longitude,
        distanceM: Math.round(distanceM),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.distanceM - b.distanceM);
}

async function queryGeoapify(lat, lng, radius) {
  const strategies = geoapifyStrategies(lat, lng, radius);
  let lastError = null;
  for (const strategy of strategies) {
    const masked = strategy.url.replace(GEOAPIFY_KEY, '***');
    console.log(`[poi] Geoapify requete (${strategy.label}) ${masked}`);
    try {
      const data = await requestGeoapifyJson(strategy);
      const places = mapGeoapify(data, lat, lng, radius);
      if (places.length > 0) return places;
    } catch (err) {
      lastError = err;
      console.warn(`[poi] Geoapify (${strategy.label}) echec : ${describeError(err)}`);
    }
  }
  if (lastError) throw lastError;
  return [];
}

async function probeGeoapify(strategy) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const options = { method: strategy.method, headers: { Accept: 'application/json' }, signal: controller.signal };
    if (strategy.method === 'POST') {
      options.headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(strategy.body);
    }
    const res = await fetch(strategy.url, options);
    const text = await res.text();
    let count = null;
    try {
      const parsed = JSON.parse(text);
      count = Array.isArray(parsed?.features) ? parsed.features.length : null;
    } catch {
      count = null;
    }
    return { status: res.status, count, body: text.slice(0, 200) };
  } catch (err) {
    return { status: null, count: null, body: null, error: describeError(err) };
  } finally {
    clearTimeout(timer);
  }
}

export async function checkGeoapify(lat, lng, radius = 150) {
  const started = Date.now();
  if (!GEOAPIFY_KEY) {
    return { configured: false, ok: false, count: 0, ms: 0, error: 'GEOAPIFY_KEY non défini', sample: [] };
  }
  const strategies = geoapifyStrategies(lat, lng, radius);
  const url = strategies[0].url.replace(GEOAPIFY_KEY, '***');
  const probes = [];
  for (const strategy of strategies) {
    const probe = await probeGeoapify(strategy);
    probes.push({
      label: strategy.label,
      status: probe.status,
      count: probe.count,
      error: probe.error || null,
    });
  }
  try {
    const places = await queryGeoapify(lat, lng, radius);
    return {
      configured: true,
      ok: true,
      count: places.length,
      ms: Date.now() - started,
      error: null,
      sample: places.slice(0, 8).map((place) => `${place.name} (${place.distanceM} m)`),
      url,
      raw: lastGeoapifyRaw,
      probes,
    };
  } catch (err) {
    return {
      configured: true,
      ok: false,
      count: 0,
      ms: Date.now() - started,
      error: describeError(err),
      sample: [],
      url,
      raw: lastGeoapifyRaw,
      probes,
    };
  }
}

export function providerInfo() {
  return {
    provider: GEOAPIFY_KEY ? 'geoapify' : 'overpass',
    geoapify: Boolean(GEOAPIFY_KEY),
    mirrors: OVERPASS_MIRRORS,
  };
}

export async function nearbyPlaces(lat, lng, radius) {
  const key = `${Number(lat).toFixed(5)},${Number(lng).toFixed(5)},${radius}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.places;

  let places;
  if (GEOAPIFY_KEY) {
    try {
      places = await withLimit(() => queryGeoapify(lat, lng, radius));
    } catch (err) {
      try {
        places = await withLimit(() => queryMirrors(buildQuery(lat, lng, radius)));
      } catch (fallbackErr) {
        throw new Error(
          `POI indisponibles (Geoapify : ${describeError(err)} ; Overpass : ${describeError(fallbackErr)})`,
        );
      }
    }
  } else {
    places = await withLimit(() => queryMirrors(buildQuery(lat, lng, radius)));
  }

  cache.set(key, { at: Date.now(), places });
  return places;
}
