export type Vec3 = [number, number, number];
export type Quat = [number, number, number, number];
export type SensorStatus = 'idle' | 'waiting' | 'live' | 'unavailable' | 'error' | 'paused';
export interface SensorReading {
  id: string; label: string; unit: string; source: string;
  status: SensorStatus; reason?: string; values: number[] | null;
  count: number; rate: number; gapP95: number | null; age: number | null;
  timestamp: number | null;
}
export interface Sample { t: number; values: number[]; sourceTimestamp?:number }
export interface TestResult {
  id: string; kind: string; started: string; duration: number; interrupted: boolean;
  instruction: string; sensors: Record<string, { count: number; rate: number; mean: number[]; sd: number[]; min: number[]; max: number[]; gapP95: number | null; samples: Sample[] }>;
  orientation: { driftDegrees: number; p95Degrees: number; samples: number } | null;
  interpretation: string[];
}
export interface Packet {
  type: string; [key: string]: unknown;
}
