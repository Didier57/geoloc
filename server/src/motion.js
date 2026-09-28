import {
  bearingDegrees,
  classifyTrack as classifyTrackBase,
  classifySpeed as classifySpeedBase,
  filterAnomalies as filterAnomaliesBase,
} from 'geoloc-shared/motion.js';
import { config } from './config.js';

export { bearingDegrees, haversineKm, impliedSpeedKmh } from 'geoloc-shared/motion.js';

const SPEED_THRESHOLDS = {
  stillMaxKmh: config.stillMaxKmh,
  walkMaxKmh: config.walkMaxKmh,
};

export function classifySpeed(speedKmh) {
  return classifySpeedBase(speedKmh, SPEED_THRESHOLDS);
}

export function filterAnomalies(points, options = {}) {
  return filterAnomaliesBase(points, {
    maxSpeedKmh: options.maxSpeedKmh ?? config.maxSpeedKmh,
    anomalyMinKm: options.anomalyMinKm ?? config.anomalyMinKm,
  });
}

export function classifyTrack(points) {
  return classifyTrackBase(points, SPEED_THRESHOLDS);
}
