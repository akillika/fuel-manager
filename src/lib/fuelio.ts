/**
 * Parser for Fuelio CSV export files.
 *
 * The Fuelio format is section-delimited with headers like `## Vehicle`,
 * `## Log`, `## Costs`, etc. Each section is a normal CSV where the row
 * right after the header is the column list.
 *
 * Repeated `## Vehicle` blocks are supported — the fill-ups following a
 * `## Log` header belong to the most recent vehicle.
 */

export interface FuelioVehicle {
  name: string;
  make?: string;
  model?: string;
  plate?: string;
  fuelType?: 'Petrol' | 'Diesel' | 'CNG' | 'EV';
  tankCapacity?: number;
  active: boolean;
}

export interface FuelioFillup {
  date: Date;
  odometer: number;
  volume: number;
  totalCost: number;
  pricePerLitre: number;
  isFull: boolean;
  fuelGrade?: string;
  station?: string;
  missed: boolean;
  notes?: string;
}

export interface FuelioParsed {
  vehicles: { vehicle: FuelioVehicle; fillups: FuelioFillup[] }[];
}

// Very small CSV row parser that handles double-quoted values with commas.
function parseCsvRow(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else inQuotes = false;
      } else cur += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',') { out.push(cur); cur = ''; }
      else cur += c;
    }
  }
  out.push(cur);
  return out.map(s => s.trim());
}

function num(v: string | undefined): number {
  if (!v) return 0;
  const n = Number(v);
  return isFinite(n) ? n : 0;
}

function bool(v: string | undefined): boolean {
  return v === '1' || v === 'true' || v === 'yes';
}

function parseDate(v: string | undefined): Date {
  if (!v) return new Date();
  // Fuelio dates are yyyy-MM-dd
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0);
  return new Date(v);
}

function detectFuelType(t?: string): FuelioVehicle['fuelType'] {
  if (!t) return 'Petrol';
  const s = t.toLowerCase();
  if (s.includes('diesel')) return 'Diesel';
  if (s.includes('cng')) return 'CNG';
  if (s.includes('ev') || s.includes('electric')) return 'EV';
  return 'Petrol';
}

export function parseFuelio(text: string): FuelioParsed {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
  const vehicles: FuelioParsed['vehicles'] = [];

  let section: string | null = null;
  let header: string[] | null = null;
  let currentVehicleIdx = -1;

  for (const raw of lines) {
    // Fuelio wraps EVERY line in quotes, including the section markers ("## Log").
    const stripped = raw.replace(/^"|"$/g, '').trim();
    if (stripped.startsWith('##')) {
      section = stripped.replace(/^##\s*/, '').trim();
      header = null;
      continue;
    }
    if (!section) continue;

    const cells = parseCsvRow(raw);

    if (!header) {
      // First non-header line inside a section is the column list
      header = cells;
      continue;
    }

    const rec: Record<string, string> = {};
    header.forEach((h, i) => { rec[h] = cells[i] ?? ''; });

    if (section === 'Vehicle') {
      const v: FuelioVehicle = {
        name: rec['Name'] || 'Vehicle',
        make: rec['Make'] || undefined,
        model: rec['Model'] || undefined,
        plate: rec['Plate'] || undefined,
        fuelType: detectFuelType(rec['Tank1Type']),
        tankCapacity: num(rec['Tank1Capacity']) || undefined,
        active: bool(rec['Active']),
      };
      vehicles.push({ vehicle: v, fillups: [] });
      currentVehicleIdx = vehicles.length - 1;
    } else if (section === 'Log') {
      if (currentVehicleIdx < 0) continue;
      const volume = num(rec['Fuel (l)'] || rec['Fuel(l)'] || rec['Fuel']);
      const total  = num(rec['Price']);
      const perL   = num(rec['VolumePrice']) || (volume > 0 ? total / volume : 0);
      const fu: FuelioFillup = {
        date: parseDate(rec['Date']),
        odometer: Math.round(num(rec['Odo (km)'] || rec['Odo(km)'] || rec['Odo'])),
        volume,
        totalCost: total,
        pricePerLitre: perL,
        isFull: bool(rec['Full']),
        fuelGrade: rec['FuelType'] === '0' ? 'Petrol' : rec['FuelType'] === '1' ? 'Diesel' : rec['FuelType'] === '2' ? 'CNG' : 'Petrol',
        station: rec['City'] || undefined,
        missed: bool(rec['Missed']),
        notes: rec['Notes'] || undefined,
      };
      vehicles[currentVehicleIdx].fillups.push(fu);
    }
    // Costs, FavStations, Pictures are ignored for now
  }

  return { vehicles };
}
