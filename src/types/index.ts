export interface Fillup {
  id: string;
  userId: string;
  vehicleId: string;
  date: Date;
  odometer: number;
  volume: number;
  pricePerLitre: number;
  totalCost: number;
  station?: string;
  fuelGrade?: string;
  isFull: boolean;
  notes?: string;
  tag?: 'work' | 'personal';    // for trip mode + expense reports
  distance?: number;             // computed
  mileage?: number;              // computed
}

export interface Vehicle {
  id: string;
  userId: string;
  name: string;
  make?: string;
  model?: string;
  plate?: string;
  fuelType: 'Petrol' | 'Diesel' | 'CNG' | 'EV';
  tankCapacity?: number;
  averageKmPerDay?: number;      // derived, used for smart odometer default
  createdAt: Date;
  archivedAt?: Date;
}

export interface FuelGoals {
  id: string;
  userId: string;
  vehicleId?: string;
  monthlyBudget?: number;
  mileageTarget?: number;
  yearlyBudget?: number;
  createdAt: Date;
  updatedAt: Date;
}

export type ServiceType =
  | 'Oil change'
  | 'Tyre rotation'
  | 'Tyres new'
  | 'Brake pads'
  | 'Air filter'
  | 'Battery'
  | 'Coolant'
  | 'Wheel alignment'
  | 'General service'
  | 'Insurance'
  | 'PUC'
  | 'RTO tax'
  | 'Fastag'
  | 'Other';

export interface ServiceRecord {
  id: string;
  userId: string;
  vehicleId: string;
  type: ServiceType;
  date: Date;
  odometer?: number;             // odometer at time of service (optional for date-only items like insurance)
  cost?: number;
  workshop?: string;
  notes?: string;
  // Reminders — either date-based, odometer-based, or both.
  nextDueDate?: Date;
  nextDueOdometer?: number;
  reminderIntervalMonths?: number;
  reminderIntervalKm?: number;
}
