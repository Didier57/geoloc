import { useEffect } from 'react';
import { CircleMarker, MapContainer, Polyline, TileLayer, Tooltip, useMap } from 'react-leaflet';

function FitBounds({ tracks, entities, selectedIds }) {
  const map = useMap();

  useEffect(() => {
    const points = [];
    tracks.forEach((track) => {
      track.points.forEach((point) => points.push([point.latitude, point.longitude]));
    });
    entities
      .filter((entity) => selectedIds.includes(entity.entityId) && entity.latitude != null)
      .forEach((entity) => points.push([entity.latitude, entity.longitude]));

    if (points.length === 1) {
      map.setView(points[0], 14);
    } else if (points.length > 1) {
      map.fitBounds(points, { padding: [30, 30] });
    }
  }, [tracks, entities, selectedIds, map]);

  return null;
}

export default function MapView({ tracks, entities, selectedIds, colors }) {
  const visibleEntities = entities.filter(
    (entity) => selectedIds.includes(entity.entityId) && entity.latitude != null,
  );

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

      <FitBounds tracks={tracks} entities={entities} selectedIds={selectedIds} />
    </MapContainer>
  );
}
