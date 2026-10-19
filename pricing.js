// Static defaults are examples; WordPress uses administrator-configured tariffs.
// Google supplies route metrics, not prices.
export const METERS_PER_MILE = 1609.344;
export const PRICING = Object.freeze({
  premium: Object.freeze({ base: 65, perMile: 2, perDrivingMinute: 3, minimum: 100, perWaitingMinute: 1, hourly: 95 }),
  luxury: Object.freeze({ base: 75, perMile: 3, perDrivingMinute: 3, minimum: 125, perWaitingMinute: 1.5, hourly: 115 }),
  executive: Object.freeze({ base: 105, perMile: 3.5, perDrivingMinute: 3, minimum: 150, perWaitingMinute: 2, hourly: 135 }),
  ghost: Object.freeze({ base: 500, perMile: 15, perDrivingMinute: 15, minimum: 600, perWaitingMinute: 5, hourly: 500 }),
  cullinan: Object.freeze({ base: 700, perMile: 20, perDrivingMinute: 25, minimum: 900, perWaitingMinute: 7.5, hourly: 750 }),
  phantom: Object.freeze({ base: 1000, perMile: 30, perDrivingMinute: 55, minimum: 1500, perWaitingMinute: 10, hourly: 1250 }),
});
export function quoteTransportation(vehicleId, route, waitMinutes = 0, service = 'transfer', hours = 3, configuredTariff = null, limits = { minHours: 2, maxHours: 12 }) {
  if (typeof vehicleId !== 'string' || (!configuredTariff && !Object.hasOwn(PRICING, vehicleId))) throw new TypeError('Unknown vehicle class.');
  const tariff = configuredTariff || PRICING[vehicleId];
  if (!tariff || ['base', 'perMile', 'perDrivingMinute', 'minimum', 'perWaitingMinute', 'hourly'].some(key => !Number.isFinite(tariff[key]) || tariff[key] < 0)) throw new TypeError('Invalid vehicle pricing.');
  if (!route || !Number.isFinite(route.distanceMeters) || route.distanceMeters < 0 || !Number.isFinite(route.durationSeconds) || route.durationSeconds < 0) throw new TypeError('A valid driving route is required.');
  if (!Number.isFinite(waitMinutes) || waitMinutes < 0 || waitMinutes > 600) throw new TypeError('Invalid stop waiting time.');
  if (!['transfer', 'hourly'].includes(service)) throw new TypeError('Unknown service type.');
  if (service === 'hourly' && (!Number.isInteger(hours) || hours < limits.minHours || hours > limits.maxHours)) throw new TypeError(`Choose ${limits.minHours}–${limits.maxHours} hours.`);
  const miles = route.distanceMeters / METERS_PER_MILE;
  const drivingMinutes = route.durationSeconds / 60;
  const drivingCharge = service === 'hourly'
    ? Math.max(hours, drivingMinutes / 60) * tariff.hourly + miles * tariff.perMile
    : Math.max(tariff.minimum, tariff.base + miles * tariff.perMile + drivingMinutes * tariff.perDrivingMinute);
  const waitingCharge = waitMinutes * tariff.perWaitingMinute;
  return { drivingCharge: round(drivingCharge), waitingCharge: round(waitingCharge), transportation: round(drivingCharge + waitingCharge), miles, kilometers: route.distanceMeters / 1000, drivingMinutes, waitingMinutes: waitMinutes, totalDurationSeconds: route.durationSeconds + waitMinutes * 60 };
}
export const round = value => Math.round((value + Number.EPSILON) * 100) / 100;
export function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return 'Not calculated';
  const minutes = Math.ceil(seconds / 60), hours = Math.floor(minutes / 60), remainder = minutes % 60;
  return hours ? `${hours} hr${hours === 1 ? '' : 's'}${remainder ? ` ${remainder} min` : ''}` : `${minutes} min`;
}
