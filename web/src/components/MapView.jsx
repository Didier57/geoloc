import { useCallback, useEffect, useRef, useState } from 'react';
import { CircleMarker, MapContainer, Polyline, Popup, TileLayer, Tooltip, useMap } from 'react-leaflet';
import { api } from '../api.js';

const MAX_POINT_MARKERS = 500;

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

export default function MapView({ tracks, entities, colors }) {
  const visibleEntities = entities.filter((entity) => entity.latitude != null);
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

      {tracks.map((track) =>
        track.points.length > 1 ? (
          <Polyline
            key={track.entityId}
            positions={track.points.map((point) => [point.latitude, point.longitude])}
            pathOptions={{ color: colors[track.entityId] || '#2563eb', weight: 4, opacity: 0.85 }}
          />
        ) : null,
      )}

      {tracks.map((track) => {
        const color = colors[track.entityId] || '#2563eb';
        return samplePoints(track.points).map(({ point, index }) => {
          const key = `${track.entityId}-${index}-${point.latitude}-${point.longitude}`;
          return (
            <CircleMarker
              key={key}
              center={[point.latitude, point.longitude]}
              radius={3}
              pathOptions={{ color, weight: 1, fillColor: color, fillOpacity: 0.9 }}
              eventHandlers={{ click: () => loadAddress(key, point.latitude, point.longitude) }}
            >
              <Popup>
                <strong>{track.name}</strong>
                <br />
                {formatTime(point.timestamp)}
                {point.accuracy != null ? ` · ±${Math.round(point.accuracy)} m` : ''}
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

      <FitBounds tracks={tracks} entities={entities} />
    </MapContainer>
  );
}
