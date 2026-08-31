import { Fillup, Vehicle, FuelGoals, ServiceRecord } from '../types';

const DEMO_UID = 'demo-user';

function daysAgo(d: number, hour = 12, minute = 0): Date {
  const now = new Date();
  now.setDate(now.getDate() - d);
  now.setHours(hour, minute, 0, 0);
  return now;
}

export const DEMO_VEHICLES: Vehicle[] = [
  {
    id: 'v-baleno',
    userId: DEMO_UID,
    name: 'Baleno',
    make: 'Maruti Suzuki',
    model: 'Baleno Delta',
    plate: 'TN 22 AB 4302',
    fuelType: 'Petrol',
    tankCapacity: 37,
    createdAt: daysAgo(400),
  },
  {
    id: 'v-classic350',
    userId: DEMO_UID,
    name: 'Classic 350',
    make: 'Royal Enfield',
    model: 'Classic 350',
    plate: 'TN 22 CH 8811',
    fuelType: 'Petrol',
    tankCapacity: 13,
    createdAt: daysAgo(280),
  },
];

export const DEMO_SERVICES: ServiceRecord[] = [
  {
    id: 's-oil-1',
    userId: DEMO_UID,
    vehicleId: 'v-baleno',
    type: 'Oil change',
    date: daysAgo(85, 10),
    odometer: 21996,
    cost: 3800,
    workshop: 'Nexa Adyar',
    reminderIntervalMonths: 6,
    reminderIntervalKm: 10000,
    nextDueDate: daysAgo(-95, 10),           // ~3 months out
    nextDueOdometer: 31996,
  },
  {
    id: 's-tyre-1',
    userId: DEMO_UID,
    vehicleId: 'v-baleno',
    type: 'Tyre rotation',
    date: daysAgo(52, 11),
    odometer: 23795,
    cost: 400,
    workshop: 'MRF Anna Nagar',
    reminderIntervalKm: 10000,
    nextDueOdometer: 33795,
  },
  {
    id: 's-puc-1',
    userId: DEMO_UID,
    vehicleId: 'v-baleno',
    type: 'PUC',
    date: daysAgo(345, 14),
    cost: 100,
    reminderIntervalMonths: 12,
    nextDueDate: daysAgo(-15, 14),           // ~15 days from now - due soon
  },
  {
    id: 's-ins-1',
    userId: DEMO_UID,
    vehicleId: 'v-baleno',
    type: 'Insurance',
    date: daysAgo(180, 15),
    cost: 18200,
    workshop: 'ICICI Lombard',
    reminderIntervalMonths: 12,
    nextDueDate: daysAgo(-185, 15),          // ~6 months away
  },
  {
    id: 's-oil-2',
    userId: DEMO_UID,
    vehicleId: 'v-classic350',
    type: 'Oil change',
    date: daysAgo(45, 16),
    odometer: 8420,
    cost: 900,
    workshop: 'Royal Enfield Service',
    reminderIntervalKm: 3000,
    nextDueOdometer: 11420,
  },
];

// Realistic 6-month fill-up history.
// Odometer grows monotonically. Prices drift a bit around ₹96/L. Volumes vary.
// Mileage/distance are recomputed at read time from the previous full-tank entry.
const raw: (Omit<Fillup, 'id' | 'userId' | 'vehicleId' | 'totalCost' | 'distance' | 'mileage' | 'isFull'> & { isFull?: boolean })[] = [
  { date: daysAgo(178, 9, 40),  odometer: 18420, volume: 32.10, pricePerLitre: 94.20, station: 'IOCL Anna Nagar', fuelGrade: 'Petrol' },
  { date: daysAgo(163, 11, 5),  odometer: 18988, volume: 30.80, pricePerLitre: 94.50, station: 'HP Adyar',        fuelGrade: 'Petrol' },
  { date: daysAgo(149, 19, 30), odometer: 19602, volume: 33.20, pricePerLitre: 94.30, station: 'IOCL Anna Nagar', fuelGrade: 'Petrol' },
  { date: daysAgo(135, 8, 10),  odometer: 20218, volume: 32.60, pricePerLitre: 95.10, station: 'BPCL OMR',        fuelGrade: 'Petrol' },
  { date: daysAgo(121, 18, 20), odometer: 20805, volume: 31.40, pricePerLitre: 95.30, station: 'HP Adyar',        fuelGrade: 'Petrol' },
  { date: daysAgo(108, 20, 45), odometer: 21395, volume: 32.90, pricePerLitre: 95.20, station: 'IOCL Anna Nagar', fuelGrade: 'Petrol' },
  { date: daysAgo(94,  10, 15), odometer: 21996, volume: 31.60, pricePerLitre: 95.50, station: 'IOCL Anna Nagar', fuelGrade: 'Petrol' },
  { date: daysAgo(80,  17, 30), odometer: 22615, volume: 33.40, pricePerLitre: 96.10, station: 'HP Adyar',        fuelGrade: 'XP 95' },
  { date: daysAgo(67,  9, 55),  odometer: 23180, volume: 30.20, pricePerLitre: 96.30, station: 'BPCL OMR',        fuelGrade: 'Petrol' },
  { date: daysAgo(53,  20, 10), odometer: 23795, volume: 32.70, pricePerLitre: 96.30, station: 'IOCL Anna Nagar', fuelGrade: 'Petrol' },
  { date: daysAgo(41,  18, 45), odometer: 24395, volume: 31.90, pricePerLitre: 96.20, station: 'HP Adyar',        fuelGrade: 'Petrol' },
  { date: daysAgo(29,  8, 20),  odometer: 24990, volume: 31.60, pricePerLitre: 96.40, station: 'IOCL Anna Nagar', fuelGrade: 'Petrol' },
  { date: daysAgo(18,  19, 5),  odometer: 25580, volume: 32.10, pricePerLitre: 96.40, station: 'BPCL OMR',        fuelGrade: 'Petrol' },
  { date: daysAgo(8,   10, 30), odometer: 26175, volume: 31.80, pricePerLitre: 96.30, station: 'IOCL Anna Nagar', fuelGrade: 'Petrol' },
  { date: daysAgo(1,   18, 42), odometer: 26550, volume: 19.80, pricePerLitre: 96.30, station: 'IOCL Anna Nagar', fuelGrade: 'Petrol', isFull: false },
];

export const DEMO_FILLUPS: Fillup[] = raw.map((r, i) => {
  const isFull = r.isFull !== undefined ? r.isFull : true;
  return {
    id: `fu-${i}`,
    userId: DEMO_UID,
    vehicleId: 'v-baleno',
    date: r.date,
    odometer: r.odometer,
    volume: r.volume,
    pricePerLitre: r.pricePerLitre,
    totalCost: Number((r.volume * r.pricePerLitre).toFixed(2)),
    station: r.station,
    fuelGrade: r.fuelGrade,
    isFull,
  };
});

// Bike fill-ups for the Classic 350 — smaller volumes, better mileage
const bikeRaw = [
  { date: daysAgo(88, 9, 30),  odometer: 7810, volume: 10.2, pricePerLitre: 95.20, station: 'IOCL Anna Nagar' },
  { date: daysAgo(69, 10, 5),  odometer: 8100, volume: 8.6,  pricePerLitre: 95.80, station: 'HP Adyar' },
  { date: daysAgo(50, 8, 15),  odometer: 8420, volume: 9.4,  pricePerLitre: 96.10, station: 'IOCL Anna Nagar' },
  { date: daysAgo(31, 18, 40), odometer: 8720, volume: 8.8,  pricePerLitre: 96.30, station: 'IOCL Anna Nagar' },
  { date: daysAgo(14, 19, 20), odometer: 9018, volume: 9.1,  pricePerLitre: 96.40, station: 'HP Adyar' },
];
bikeRaw.forEach((r, i) => {
  DEMO_FILLUPS.push({
    id: `bike-fu-${i}`,
    userId: DEMO_UID,
    vehicleId: 'v-classic350',
    date: r.date,
    odometer: r.odometer,
    volume: r.volume,
    pricePerLitre: r.pricePerLitre,
    totalCost: Number((r.volume * r.pricePerLitre).toFixed(2)),
    station: r.station,
    fuelGrade: 'Petrol',
    isFull: true,
  });
});

export const DEMO_GOALS: FuelGoals[] = [
  {
    id: 'g-1',
    userId: DEMO_UID,
    monthlyBudget: 6000,
    yearlyBudget: 70000,
    mileageTarget: 19,
    createdAt: daysAgo(180),
    updatedAt: daysAgo(30),
  },
];
