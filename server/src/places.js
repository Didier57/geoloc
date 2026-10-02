const DEFAULT_MIRRORS = [
  'https://overpass-api.de/api/interpreter',
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
  nwr${around}["amenity"~"^(${AMENITY_VALUES})$"];
  nwr${around}["shop"];
  nwr${around}["tourism"~"^(${TOURISM_VALUES})$"];
  nwr${around}["leisure"~"^(${LEISURE_VALUES})$"];
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
  return KIND_LABELS[kind] || kind.replace(/_/g, ' ');
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
          errors.push({
            mirror,
            message: err?.name === 'AbortError' ? 'délai dépassé' : err?.message || String(err),
          });
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
        error: err?.name === 'AbortError' ? 'délai dépassé' : err?.message || String(err),
        ms: Date.now() - started,
      });
    } finally {
      clearTimeout(timer);
    }
  }
  return results;
}

export async function nearbyPlaces(lat, lng, radius) {
  const key = `${Number(lat).toFixed(5)},${Number(lng).toFixed(5)},${radius}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.places;

  const query = buildQuery(lat, lng, radius);
  const places = await withLimit(() => queryMirrors(query));

  cache.set(key, { at: Date.now(), places });
  return places;
}
