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

const object = value => value && typeof value === 'object' && !Array.isArray(value);
const inRange = (value, maximum = 1000000, minimum = 0) => Number.isFinite(value) && value >= minimum && value <= maximum;

function serviceProfiles(tariff) {
  if (!Object.hasOwn(tariff, 'transfer') && !Object.hasOwn(tariff, 'hourlyBooking')) return null;
  const transfer = tariff.transfer, hourlyBooking = tariff.hourlyBooking;
  if (!object(transfer) || transfer.version !== 2 || !['time', 'mileage'].includes(transfer.mode) || !object(hourlyBooking)) throw new TypeError('Complete Transfer and Hourly pricing settings are required.');
  if (['base', 'perMile', 'perDrivingMinute', 'minimum', 'perWaitingMinute', 'hourly'].some(key => !inRange(tariff[key])) || ['hourly', 'perMile', 'perWaitingMinute'].some(key => !inRange(hourlyBooking[key]))) throw new TypeError('Invalid vehicle pricing.');
  if (['pickupFreeMinutes', 'returnFreeMinutes'].some(key => !inRange(transfer[key], 1440)) || ['pickupFreeMiles', 'returnFreeMiles'].some(key => !inRange(transfer[key], 100000)) || ['roundingMinutes', 'minimumMinutes'].some(key => !Number.isInteger(transfer[key]) || !inRange(transfer[key], 1440, 1))) throw new TypeError('Invalid Transfer pricing settings.');
  return { transfer, hourlyBooking };
}

function transferLegs(route) {
  const legs = route.transferLegs;
  if (!object(legs) || !object(legs.pickup) || !object(legs.return) || !inRange(route.distanceMeters, 1000000000) || !inRange(route.durationSeconds, 60000000) || [legs.pickup, legs.return].some(leg => !inRange(leg.distanceMeters, 1000000000) || !inRange(leg.durationSeconds, 60000000))) throw new TypeError('Verified service-base pickup and return routes are required.');
  return legs;
}

export function quoteTransportation(vehicleId, route, waitMinutes = 0, service = 'transfer', hours = 3, configuredTariff = null, limits = { minHours: 3, maxHours: 24 }) {
  if (typeof vehicleId !== 'string' || (!configuredTariff && !Object.hasOwn(PRICING, vehicleId))) throw new TypeError('Unknown vehicle class.');
  const tariff = configuredTariff || PRICING[vehicleId];
  if (!tariff || ['base', 'perMile', 'perDrivingMinute', 'minimum', 'perWaitingMinute', 'hourly'].some(key => !Number.isFinite(tariff[key]) || tariff[key] < 0)) throw new TypeError('Invalid vehicle pricing.');
  if (!route || !Number.isFinite(route.distanceMeters) || route.distanceMeters < 0 || !Number.isFinite(route.durationSeconds) || route.durationSeconds < 0) throw new TypeError('A valid driving route is required.');
  if (!Number.isFinite(waitMinutes) || waitMinutes < 0 || waitMinutes > 600) throw new TypeError('Invalid stop waiting time.');
  if (!['transfer', 'hourly'].includes(service)) throw new TypeError('Unknown service type.');
  if (service === 'hourly' && (!Number.isInteger(hours) || hours < limits.minHours || hours > limits.maxHours)) throw new TypeError(`Choose ${limits.minHours}–${limits.maxHours} hours.`);
  const profiles = serviceProfiles(tariff);
  const miles = route.distanceMeters / METERS_PER_MILE;
  const drivingMinutes = route.durationSeconds / 60;
  let drivingCharge, waitingRate = tariff.perWaitingMinute, breakdown = {};
  if (service === 'hourly') {
    const hourly = profiles?.hourlyBooking || tariff;
    drivingCharge = Math.max(hours, drivingMinutes / 60) * hourly.hourly + miles * hourly.perMile;
    waitingRate = hourly.perWaitingMinute;
    if (profiles) breakdown.pricingMode = 'hourly';
  } else if (profiles) {
    const { transfer } = profiles, legs = transferLegs(route);
    breakdown.pricingMode = transfer.mode;
    if (transfer.mode === 'time') {
      const pickupMinutes = Math.max(0, legs.pickup.durationSeconds / 60 - transfer.pickupFreeMinutes);
      const passengerMinutes = Math.ceil(drivingMinutes / transfer.roundingMinutes) * transfer.roundingMinutes;
      const returnMinutes = Math.max(0, legs.return.durationSeconds / 60 - transfer.returnFreeMinutes);
      const billableMinutes = pickupMinutes + passengerMinutes + returnMinutes;
      const chargedMinutes = Math.max(transfer.minimumMinutes, billableMinutes);
      drivingCharge = chargedMinutes / 60 * tariff.hourly;
      Object.assign(breakdown, { billablePickupMinutes: pickupMinutes, roundedPassengerMinutes: passengerMinutes, billableReturnMinutes: returnMinutes, billableMinutes, chargedMinutes });
    } else {
      const pickupMiles = Math.max(0, legs.pickup.distanceMeters / METERS_PER_MILE - transfer.pickupFreeMiles);
      const returnMiles = Math.max(0, legs.return.distanceMeters / METERS_PER_MILE - transfer.returnFreeMiles);
      const billableMiles = pickupMiles + miles + returnMiles;
      drivingCharge = Math.max(tariff.minimum, billableMiles * tariff.perMile);
      Object.assign(breakdown, { billablePickupMiles: pickupMiles, passengerMiles: miles, billableReturnMiles: returnMiles, billableMiles });
    }
  } else {
    // Old booking snapshots retain the original combined transfer formula.
    drivingCharge = Math.max(tariff.minimum, tariff.base + miles * tariff.perMile + drivingMinutes * tariff.perDrivingMinute);
  }
  let waitingCharge = waitMinutes * waitingRate;
  // New Transfer fares and waiting are separate money line items. Legacy and
  // Hourly rounding remains unchanged for accepted historical calculations.
  if (profiles && service === 'transfer') { drivingCharge = round(drivingCharge); waitingCharge = round(waitingCharge); }
  const transportation = round(drivingCharge + waitingCharge);
  if (profiles && (!Number.isFinite(transportation) || transportation > 9999999999.99)) throw new TypeError('This journey exceeds the maximum supported fare.');
  return { drivingCharge: round(drivingCharge), waitingCharge: round(waitingCharge), transportation, miles, kilometers: route.distanceMeters / 1000, drivingMinutes, waitingMinutes: waitMinutes, totalDurationSeconds: route.durationSeconds + waitMinutes * 60, ...breakdown };
}
export const round = value => Math.round((value + Number.EPSILON) * 100) / 100;
export function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return 'Not calculated';
  const minutes = Math.ceil(seconds / 60), hours = Math.floor(minutes / 60), remainder = minutes % 60;
  return hours ? `${hours} hr${hours === 1 ? '' : 's'}${remainder ? ` ${remainder} min` : ''}` : `${minutes} min`;
}
