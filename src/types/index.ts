export interface Fillup {
  id: string;
  userId: string;
  vehicleId: string;
  date: Date;
  odometer: number;             // km
  volume: number;               // litres
  pricePerLitre: number;        // INR
  totalCost: number;            // INR (redundant but denormalised)
  station?: string;
  fuelGrade?: string;           // e.g. 'Petrol', 'XP 95', 'CNG'
  isFull: boolean;              // full tank (needed for mileage math)
  notes?: string;
  distance?: number;            // km since previous full-tank fill-up
  mileage?: number;             // km/L computed for this fill-up
}

export interface Vehicle {
  id: string;
  userId: string;
  name: string;                 // 'Baleno' / 'Bike'
  make?: string;
  model?: string;
  plate?: string;
  fuelType: 'Petrol' | 'Diesel' | 'CNG' | 'EV';
  tankCapacity?: number;        // litres
  createdAt: Date;
  archivedAt?: Date;
}

export interface FuelGoals {
  id: string;
  userId: string;
  monthlyBudget?: number;       // INR
  mileageTarget?: number;       // km/L
  createdAt: Date;
  updatedAt: Date;
}
