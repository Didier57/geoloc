import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CircleMarker,
  MapContainer,
  Marker,
  Polyline,
  Popup,
  TileLayer,
  Tooltip,
  useMap,
} from 'react-leaflet';
import { divIcon } from 'leaflet';
import { api } from '../api.js';
import { bearingDegrees, haversineKm, MODE_LABELS, modeColor } from '../motion.js';

const MAX_POINT_MARKERS = 500;
const MAX_ARROWS = 40;
const ARROW_STEP_KM = 0.3;

function FitBounds({ tracks, entities }) {
  const map = useMap();

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
  }, [tracks, entities, map]);

  return null;
}

function formatTime(value) {
  if (!value) return 'Heure inconnue';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Heure inconnue';
  return date.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
}

function samplePoints(points) {
  if (points.length <= MAX_POINT_MARKERS) {
    return points.map((point, index) => ({ point, index }));
  }
  const step = Math.ceil(points.length / MAX_POINT_MARKERS);
  const result = [];
  for (let i = 0; i < points.length; i += step) {
    result.push({ point: points[i], index: i });
  }
  const lastIndex = points.length - 1;
  if (result[result.length - 1].index !== lastIndex) {
    result.push({ point: points[lastIndex], index: lastIndex });
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

export default function MapView({ tracks, entities, selectedIds, colors }) {
  const selected = new Set(selectedIds || []);
  const visibleEntities = entities.filter(
    (entity) => entity.latitude != null && selected.has(entity.entityId),
  );
  const names = {};
  entities.forEach((entity) => {
    names[entity.entityId] = entity.name;
  });
  const [addresses, setAddresses] = useState({});
  const requested = useRef(new Set());

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

  return (
    <MapContainer center={[46.6, 2.5]} zoom={6} style={{ height: '100%', width: '100%' }}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {tracks.map((track) => {
        const fallbackColor = colors[track.entityId] || '#2563eb';
        return buildRuns(track.points, fallbackColor).map((run, index) => (
          <Polyline
            key={`${track.entityId}-run-${index}-${run.mode}`}
            positions={run.positions}
            pathOptions={{ color: run.color, weight: 4, opacity: 0.85 }}
          />
        ));
      })}

      {tracks.map((track) => {
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

      {tracks.map((track) => {
        const fallbackColor = colors[track.entityId] || '#2563eb';
        return samplePoints(track.points).map(({ point, index }) => {
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
                {point.mode ? (
                  <>
                    <br />
                    {MODE_LABELS[point.mode] || point.mode}
                    {point.speed != null ? ` · ${point.speed} km/h` : ''}
                  </>
                ) : null}
                <br />
                <span className="popup-address">{addresses[key] || 'Cliquez pour voir l’adresse'}</span>
              </Popup>
            </CircleMarker>
          );
        });
      })}

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
          <Tooltip>
            {entity.name}
            {entity.state ? ` — ${entity.state}` : ''}
          </Tooltip>
        </CircleMarker>
      ))}

      <FitBounds tracks={tracks} entities={visibleEntities} />
    </MapContainer>
  );
}
