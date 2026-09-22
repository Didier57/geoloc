import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CircleMarker,
  MapContainer,
  Marker,
  Polyline,
  Popup,
  TileLayer,
  Tooltip,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import { divIcon } from 'leaflet';
import { api } from '../api.js';
import {
  bearingDegrees,
  detectStays,
  haversineKm,
  MODE_LABELS,
  modeColor,
  STAY_MIN_MINUTES,
  STAY_RADIUS_KM,
} from '../motion.js';

const MAX_POINT_MARKERS = 500;
const POINT_MERGE_RADIUS_M = 200;
const SPIKE_RADIUS_M = 200;
const STAY_OUTLIER_TOLERANCE = 3;
const STAY_MERGE_RADIUS_M = 250;
const STAY_MERGE_GAP_MINUTES = 10;
const MAX_ARROWS = 40;
const ARROW_STEP_KM = 0.3;
const STAY_COLOR = '#7c3aed';
const PLACES_MIN_ZOOM = 17;
const PLACES_RADIUS_M = 150;
const MAX_PLACE_MARKERS = 80;

const BASEMAP_STORAGE_KEY = 'geoloc.basemap';

const BASEMAPS = [
  {
    id: 'osm',
    label: 'OpenStreetMap',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19,
  },
  {
    id: 'osmfr',
    label: 'OSM France',
    url: 'https://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png',
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> France',
    maxZoom: 19,
  },
  {
    id: 'humanitarian',
    label: 'Humanitaire',
    url: 'https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png',
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributeurs · Humanitarian',
    maxZoom: 19,
  },
  {
    id: 'cyclosm',
    label: 'CyclOSM',
    url: 'https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png',
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributeurs · CyclOSM',
    maxZoom: 19,
  },
  {
    id: 'opentopomap',
    label: 'Relief',
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributeurs, SRTM · <a href="https://opentopomap.org">OpenTopoMap</a>',
    maxZoom: 17,
  },
  {
    id: 'satellite',
    label: 'Satellite',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri — Esri, Maxar, Earthstar Geographics',
    maxZoom: 19,
  },
];

function readStoredBasemap() {
  try {
    const value = localStorage.getItem(BASEMAP_STORAGE_KEY);
    if (value && BASEMAPS.some((item) => item.id === value)) return value;
  } catch {
    /* localStorage indisponible */
  }
  return null;
}

function ZoomWatcher({ onChange }) {
  const map = useMapEvents({
    zoomend: () => onChange(map.getZoom()),
  });

  useEffect(() => {
    onChange(map.getZoom());
  }, [map, onChange]);

  return null;
}

function coordKey(latitude, longitude) {
  return `${Number(latitude).toFixed(5)},${Number(longitude).toFixed(5)}`;
}

function FitBounds({ tracks, entities }) {
  const map = useMap();
  const signature = useMemo(() => {
    const parts = [];
    tracks.forEach((track) => {
      track.points.forEach((point) =>
        parts.push(`${Number(point.latitude).toFixed(5)},${Number(point.longitude).toFixed(5)}`),
      );
    });
    entities
      .filter((entity) => entity.latitude != null)
      .forEach((entity) =>
        parts.push(`${Number(entity.latitude).toFixed(5)},${Number(entity.longitude).toFixed(5)}`),
      );
    return parts.join('|');
  }, [tracks, entities]);

  useEffect(() => {
    const points = [];
    tracks.forEach((track) => {
      track.points.forEach((point) => points.push([point.latitude, point.longitude]));
    });
    entities
      .filter((entity) => entity.latitude != null)
      .forEach((entity) => points.push([entity.latitude, entity.longitude]));

    if (points.length === 1) {
      map.setView(points[0], 14);
    } else if (points.length > 1) {
      map.fitBounds(points, { padding: [30, 30] });
    }
  }, [signature, map]);

  return null;
}

function formatTime(value) {
  if (!value) return 'Heure inconnue';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Heure inconnue';
  return date.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
}

function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
}

function formatDuration(ms) {
  const minutes = Math.max(0, Math.round(ms / 60000));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours && rest) return `${hours} h ${String(rest).padStart(2, '0')}`;
  if (hours) return `${hours} h`;
  return `${rest} min`;
}

function cleanTrack(points, radiusKm = SPIKE_RADIUS_M / 1000) {
  if (!Array.isArray(points) || points.length < 3) return points || [];
  const kept = [points[0]];
  for (let i = 1; i < points.length - 1; i += 1) {
    const previous = kept[kept.length - 1];
    const point = points[i];
    const next = points[i + 1];
    const leaves =
      haversineKm(previous.latitude, previous.longitude, point.latitude, point.longitude) > radiusKm;
    const returns =
      haversineKm(point.latitude, point.longitude, next.latitude, next.longitude) > radiusKm &&
      haversineKm(previous.latitude, previous.longitude, next.latitude, next.longitude) < radiusKm;
    if (leaves && returns) continue;
    kept.push(point);
  }
  kept.push(points[points.length - 1]);
  return kept;
}

function mergeStays(
  stays,
  radiusKm = STAY_MERGE_RADIUS_M / 1000,
  maxGapMs = STAY_MERGE_GAP_MINUTES * 60000,
) {
  const merged = [];
  stays.forEach((stay) => {
    const previous = merged[merged.length - 1];
    if (previous) {
      const distance = haversineKm(
        previous.latitude,
        previous.longitude,
        stay.latitude,
        stay.longitude,
      );
      const startMs = new Date(stay.start).getTime();
      const previousEndMs = new Date(previous.end).getTime();
      if (distance <= radiusKm && startMs - previousEndMs <= maxGapMs) {
        const total = previous.count + stay.count;
        previous.latitude = (previous.latitude * previous.count + stay.latitude * stay.count) / total;
        previous.longitude =
          (previous.longitude * previous.count + stay.longitude * stay.count) / total;
        previous.count = total;
        previous.end = stay.end;
        previous.durationMs = new Date(stay.end).getTime() - new Date(previous.start).getTime();
        return;
      }
    }
    merged.push({ ...stay });
  });
  return merged;
}

function collapseStays(points, stays) {
  if (!stays.length) return points;
  const ranges = stays.map((stay) => ({
    start: new Date(stay.start).getTime(),
    end: new Date(stay.end).getTime(),
    latitude: stay.latitude,
    longitude: stay.longitude,
  }));
  return points.map((point) => {
    const time = new Date(point.timestamp).getTime();
    if (!Number.isFinite(time)) return point;
    const range = ranges.find((item) => time >= item.start && time <= item.end);
    if (!range) return point;
    return { ...point, latitude: range.latitude, longitude: range.longitude };
  });
}

function mergeNearbyPoints(points, radiusKm = POINT_MERGE_RADIUS_M / 1000) {
  const merged = [];
  const latCell = radiusKm / 111.32;
  const cells = new Map();
  const cellKey = (gx, gy) => `${gx}:${gy}`;

  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    if (point?.latitude == null || point?.longitude == null) continue;
    const lngCell = latCell / Math.max(Math.cos((point.latitude * Math.PI) / 180), 0.01);
    const gx = Math.floor(point.longitude / lngCell);
    const gy = Math.floor(point.latitude / latCell);

    let match = null;
    for (let dx = -1; dx <= 1 && !match; dx += 1) {
      for (let dy = -1; dy <= 1 && !match; dy += 1) {
        const bucket = cells.get(cellKey(gx + dx, gy + dy));
        if (!bucket) continue;
        for (const cluster of bucket) {
          if (
            haversineKm(cluster.latitude, cluster.longitude, point.latitude, point.longitude) <=
            radiusKm
          ) {
            match = cluster;
            break;
          }
        }
      }
    }

    if (match) {
      match.count += 1;
      match.last = point;
      continue;
    }

    const cluster = { point, latitude: point.latitude, longitude: point.longitude, index, count: 1, last: point };
    merged.push(cluster);
    const key = cellKey(gx, gy);
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(cluster);
  }
  return merged;
}

function capPoints(entries) {
  if (entries.length <= MAX_POINT_MARKERS) return entries;
  const step = Math.ceil(entries.length / MAX_POINT_MARKERS);
  const result = [];
  for (let i = 0; i < entries.length; i += step) {
    result.push(entries[i]);
  }
  const last = entries[entries.length - 1];
  if (result[result.length - 1].index !== last.index) {
    result.push(last);
  }
  return result;
}

function buildRuns(points, fallbackColor) {
  const runs = [];
  let current = null;
  for (let i = 1; i < points.length; i += 1) {
    const previous = points[i - 1];
    const point = points[i];
    const mode = point.mode || 'unknown';
    if (!current || current.mode !== mode) {
      current = {
        mode,
        color: modeColor(mode, fallbackColor),
        positions: [[previous.latitude, previous.longitude]],
      };
      runs.push(current);
    }
    current.positions.push([point.latitude, point.longitude]);
  }
  return runs;
}

function arrowSamples(points) {
  const samples = [];
  let distance = 0;
  for (let i = 1; i < points.length && samples.length < MAX_ARROWS; i += 1) {
    const previous = points[i - 1];
    const point = points[i];
    distance += haversineKm(
      previous.latitude,
      previous.longitude,
      point.latitude,
      point.longitude,
    );
    if (distance >= ARROW_STEP_KM) {
      samples.push(i);
      distance = 0;
    }
  }
  return samples;
}

function arrowIcon(bearing, color) {
  return divIcon({
    className: 'route-arrow',
    html: `<div class="route-arrow-inner" style="color:${color};transform:rotate(${Math.round(
      bearing,
    )}deg)"><svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M12 2l7 18-7-5-7 5z" fill="currentColor"/></svg></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
}

export function stayIcon() {
  return divIcon({
    className: 'route-stay',
    html: `<div class="route-stay-inner"><svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true"><path d="M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z" fill="currentColor"/></svg></div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
}

export default function MapView({
  tracks,
  entities,
  selectedIds,
  colors,
  showLive = true,
  isAdmin = false,
  onPointDeleted,
  onError,
}) {
  const selected = new Set(selectedIds || []);
  const visibleEntities = showLive
    ? entities.filter((entity) => entity.latitude != null && selected.has(entity.entityId))
    : [];
  const names = {};
  entities.forEach((entity) => {
    names[entity.entityId] = entity.name;
  });
  const [addresses, setAddresses] = useState({});
  const requested = useRef(new Set());
  const [zoom, setZoom] = useState(6);
  const [places, setPlaces] = useState({});
  const placesRequested = useRef(new Set());
  const [basemap, setBasemap] = useState(readStoredBasemap);
  const [basemapOpen, setBasemapOpen] = useState(false);

  const basemapId = basemap || 'osm';
  const activeBasemap = BASEMAPS.find((item) => item.id === basemapId) || BASEMAPS[0];

  useEffect(() => {
    if (!basemap) return;
    try {
      localStorage.setItem(BASEMAP_STORAGE_KEY, basemap);
    } catch {
      /* localStorage indisponible */
    }
  }, [basemap]);

  const displayTracks = useMemo(
    () =>
      tracks.map((track) => {
        const cleaned = cleanTrack(track.points);
        const trackStays = mergeStays(
          detectStays(cleaned, STAY_RADIUS_KM, STAY_MIN_MINUTES, STAY_OUTLIER_TOLERANCE),
        );
        return { ...track, points: collapseStays(cleaned, trackStays), stays: trackStays };
      }),
    [tracks],
  );

  const stays = useMemo(
    () =>
      displayTracks.flatMap((track) =>
        track.stays.map((stay, index) => ({
          ...stay,
          key: `${track.entityId}-stay-${index}-${stay.latitude}-${stay.longitude}`,
          entityId: track.entityId,
          name: names[track.entityId] || track.name || track.entityId,
        })),
      ),
    [displayTracks, entities],
  );

  useEffect(() => {
    if (zoom < PLACES_MIN_ZOOM) return;
    stays.forEach((stay) => {
      const key = coordKey(stay.latitude, stay.longitude);
      if (placesRequested.current.has(key)) return;
      placesRequested.current.add(key);
      api
        .places(stay.latitude, stay.longitude, PLACES_RADIUS_M)
        .then(({ places: list }) => {
          setPlaces((prev) => ({ ...prev, [key]: list || [] }));
        })
        .catch(() => {
          setPlaces((prev) => ({ ...prev, [key]: [] }));
        });
    });
  }, [zoom, stays]);

  const placeMarkers = [];
  if (zoom >= PLACES_MIN_ZOOM) {
    const seen = new Set();
    for (const stay of stays) {
      if (placeMarkers.length >= MAX_PLACE_MARKERS) break;
      const list = places[coordKey(stay.latitude, stay.longitude)] || [];
      for (const place of list) {
        if (placeMarkers.length >= MAX_PLACE_MARKERS) break;
        if (seen.has(place.id)) continue;
        seen.add(place.id);
        placeMarkers.push(place);
      }
    }
  }

  const loadAddress = useCallback((key, latitude, longitude) => {
    if (requested.current.has(key)) return;
    requested.current.add(key);
    setAddresses((prev) => ({ ...prev, [key]: 'Chargement…' }));
    api
      .reverse(latitude, longitude)
      .then(({ address }) => {
        setAddresses((prev) => ({ ...prev, [key]: address || 'Adresse introuvable' }));
      })
      .catch(() => {
        setAddresses((prev) => ({ ...prev, [key]: 'Adresse indisponible' }));
      });
  }, []);

  const [removing, setRemoving] = useState(null);

  const removePoint = useCallback(
    async (key, entityId, timestamp) => {
      if (!timestamp) return;
      if (!window.confirm('Supprimer définitivement cette position ?')) return;
      setRemoving(key);
      try {
        await api.deletePoint(entityId, timestamp);
        onPointDeleted?.();
      } catch (err) {
        onError?.(err.message);
      } finally {
        setRemoving(null);
      }
    },
    [onPointDeleted, onError],
  );

  return (
    <MapContainer center={[46.6, 2.5]} zoom={6} style={{ height: '100%', width: '100%' }}>
      <TileLayer
        key={activeBasemap.id}
        url={activeBasemap.url}
        attribution={activeBasemap.attribution}
        maxZoom={activeBasemap.maxZoom}
      />

      {displayTracks.map((track) => {
        const fallbackColor = colors[track.entityId] || '#2563eb';
        return buildRuns(track.points, fallbackColor).map((run, index) => (
          <Polyline
            key={`${track.entityId}-run-${index}-${run.mode}`}
            positions={run.positions}
            pathOptions={{ color: run.color, weight: 4, opacity: 0.85 }}
          />
        ));
      })}

      {displayTracks.map((track) => {
        const fallbackColor = colors[track.entityId] || '#2563eb';
        return arrowSamples(track.points).map((index) => {
          const previous = track.points[index - 1];
          const point = track.points[index];
          const bearing = bearingDegrees(
            previous.latitude,
            previous.longitude,
            point.latitude,
            point.longitude,
          );
          return (
            <Marker
              key={`${track.entityId}-arrow-${index}`}
              position={[point.latitude, point.longitude]}
              icon={arrowIcon(bearing, modeColor(point.mode, fallbackColor))}
              interactive={false}
            />
          );
        });
      })}

      {displayTracks.map((track) => {
        const fallbackColor = colors[track.entityId] || '#2563eb';
        return capPoints(mergeNearbyPoints(track.points)).map(({ point, index, count, last }) => {
          const key = `${track.entityId}-${index}-${point.latitude}-${point.longitude}`;
          const color = modeColor(point.mode, fallbackColor);
          return (
            <CircleMarker
              key={key}
              center={[point.latitude, point.longitude]}
              radius={3}
              pathOptions={{ color, weight: 1, fillColor: color, fillOpacity: 0.9 }}
              eventHandlers={{ click: () => loadAddress(key, point.latitude, point.longitude) }}
            >
              <Popup>
                <strong>{names[track.entityId] || track.name || track.entityId}</strong>
                <br />
                {formatTime(point.timestamp)}
                {point.accuracy != null ? ` · ±${Math.round(point.accuracy)} m` : ''}
                {count > 1 ? (
                  <>
                    <br />
                    <span className="popup-stay">
                      {count} positions regroupées · jusqu’à {formatTime(last.timestamp)}
                    </span>
                  </>
                ) : null}
                {point.mode ? (
                  <>
                    <br />
                    {MODE_LABELS[point.mode] || point.mode}
                    {point.speed != null ? ` · ${point.speed} km/h` : ''}
                  </>
                ) : null}
                <br />
                <span className="popup-address">{addresses[key] || 'Cliquez pour voir l’adresse'}</span>
                {isAdmin && point.timestamp ? (
                  <button
                    type="button"
                    className="btn danger popup-delete"
                    onClick={() => removePoint(key, track.entityId, point.timestamp)}
                    disabled={removing === key}
                  >
                    {removing === key ? 'Suppression…' : 'Supprimer cette position'}
                  </button>
                ) : null}
              </Popup>
            </CircleMarker>
          );
        });
      })}

      {stays.map((stay) => (
        <Marker
          key={stay.key}
          position={[stay.latitude, stay.longitude]}
          icon={stayIcon()}
          eventHandlers={{ click: () => loadAddress(stay.key, stay.latitude, stay.longitude) }}
        >
          <Popup>
            <strong>{stay.name}</strong>
            <br />
            <span className="popup-stay">Arrêt sur place</span>
            <br />
            De {formatDateTime(stay.start)} à {formatDateTime(stay.end)}
            <br />
            Durée : {formatDuration(stay.durationMs)}
            <br />
            <span className="popup-address">
              {addresses[stay.key] || 'Cliquez pour voir le lieu'}
            </span>
          </Popup>
        </Marker>
      ))}

      {placeMarkers.map((place) => (
        <CircleMarker
          key={place.id}
          center={[place.latitude, place.longitude]}
          radius={4}
          pathOptions={{ color: '#b45309', weight: 2, fillColor: '#fbbf24', fillOpacity: 1 }}
        >
          <Tooltip permanent direction="right" offset={[6, 0]} className="place-label">
            {place.name}
          </Tooltip>
        </CircleMarker>
      ))}

      <ZoomWatcher onChange={setZoom} />

      {visibleEntities.map((entity) => (
        <CircleMarker
          key={entity.entityId}
          center={[entity.latitude, entity.longitude]}
          radius={7}
          pathOptions={{
            color: '#ffffff',
            weight: 2,
            fillColor: colors[entity.entityId] || '#2563eb',
            fillOpacity: 1,
          }}
        >
          <Tooltip>{entity.name}</Tooltip>
        </CircleMarker>
      ))}

      <FitBounds tracks={displayTracks} entities={visibleEntities} />

      <div className="basemap-control">
        <button
          type="button"
          className="basemap-toggle"
          onClick={() => setBasemapOpen((open) => !open)}
          title="Changer le fond de carte"
          aria-label="Changer le fond de carte"
          aria-expanded={basemapOpen}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <path
              d="M9 3 3 5.5v15L9 18l6 3 6-2.5v-15L15 6 9 3zm0 2.2 6 3v12.4l-6-3V5.2z"
              fill="currentColor"
            />
          </svg>
          <span>{activeBasemap.label}</span>
        </button>
        {basemapOpen && (
          <div className="basemap-menu">
            {BASEMAPS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`basemap-item ${item.id === basemapId ? 'active' : ''}`}
                onClick={() => {
                  setBasemap(item.id);
                  setBasemapOpen(false);
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </MapContainer>
  );
}
