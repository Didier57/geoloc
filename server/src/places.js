const OVERPASS_URL =
  process.env.OVERPASS_URL || 'https://overpass.kumi.systems/api/interpreter';
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
};

const cache = new Map();

let chain = Promise.resolve();
let lastCall = 0;

function schedule(task) {
  const result = chain.then(async () => {
    const wait = Math.max(0, 1000 - (Date.now() - lastCall));
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    lastCall = Date.now();
    return task();
  });
  chain = result.catch(() => {});
  return result;
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
    null
  );
}

function labelOf(kind) {
  if (!kind || kind === 'yes' || kind === 'no') return 'Lieu';
  return KIND_LABELS[kind] || kind.replace(/_/g, ' ');
}

export async function nearbyPlaces(lat, lng, radius) {
  const key = `${Number(lat).toFixed(5)},${Number(lng).toFixed(5)},${radius}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.places;

  const query = buildQuery(lat, lng, radius);

  const places = await schedule(async () => {
    const res = await fetch(OVERPASS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'geoloc-app/1.0 (https://github.com/Didier57/geoloc)',
        Accept: 'application/json',
      },
      body: `data=${encodeURIComponent(query)}`,
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
  });

  cache.set(key, { at: Date.now(), places });
  return places;
}
