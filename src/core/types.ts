// Branded types for mathematical safety and domain correctness
export type ISODate = string & { readonly __brand: 'ISODate' };
export type DayIndex = number & { readonly __brand: 'DayIndex' };
export type CentiCelsius = number & { readonly __brand: 'CentiC' }; // e.g. 36.65 °C = 3665

export type BleedingIntensity = 'spotting' | 'light' | 'medium' | 'heavy';

export type MucusSensation = 'dry' | 'nothing' | 'moist' | 'wet';
export type MucusAppearance = 'none' | 'thick' | 'creamy' | 'clear' | 'stretchy';

export type DisturbanceType =
  | 'alcohol'
  | 'illness'
  | 'badSleep'
  | 'lateMeasure'
  | 'medication'
  | 'travel';

export interface BbtRecord {
  readonly value: CentiCelsius;
  readonly time?: string; // 'HH:MM'
  readonly disturbances?: readonly DisturbanceType[];
  readonly excluded?: boolean;
}

export interface MucusRecord {
  readonly sensation: MucusSensation;
  readonly appearance: MucusAppearance;
}

export interface CervixRecord {
  readonly position?: 'low' | 'high';
  readonly firmness?: 'firm' | 'soft';
  readonly opening?: 'closed' | 'open';
}

export interface DayEntry {
  readonly date: ISODate;
  readonly bleeding?: BleedingIntensity;
  readonly cycleStartOverride?: boolean;
  readonly bbt?: BbtRecord;
  readonly mucus?: MucusRecord;
  readonly cervix?: CervixRecord;
  readonly symptoms?: readonly string[];
  readonly mood?: readonly string[];
  readonly sex?: 'none' | 'protected' | 'unprotected';
  readonly note?: string;
  readonly updatedAt: number;
}
