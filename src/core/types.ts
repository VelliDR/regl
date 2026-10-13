// Branded types for mathematical safety and domain correctness
export type ISODate = string & { readonly __brand: "ISODate" };
export type DayIndex = number & { readonly __brand: "DayIndex" };
export type CentiCelsius = number & { readonly __brand: "CentiC" }; // e.g. 36.65 °C = 3665

export type BleedingIntensity = "spotting" | "light" | "medium" | "heavy";

export type MucusSensation = "dry" | "nothing" | "moist" | "wet";
export type MucusAppearance =
  "none" | "thick" | "creamy" | "clear" | "stretchy";

export type DisturbanceType =
  "alcohol" | "illness" | "badSleep" | "lateMeasure" | "medication" | "travel";

export interface BbtRecord {
  readonly value: CentiCelsius;
  readonly time?: string | undefined; // 'HH:MM'
  readonly disturbances?: readonly DisturbanceType[] | undefined;
  readonly excluded?: boolean | undefined;
}

export interface MucusRecord {
  readonly sensation: MucusSensation;
  readonly appearance: MucusAppearance;
}

export interface CervixRecord {
  readonly position?: "low" | "high" | undefined;
  readonly firmness?: "firm" | "soft" | undefined;
  readonly opening?: "closed" | "open" | undefined;
}

export interface DayEntry {
  readonly date: ISODate;
  readonly bleeding?: BleedingIntensity | undefined;
  readonly cycleStartOverride?: boolean | undefined;
  readonly bbt?: BbtRecord | undefined;
  readonly mucus?: MucusRecord | undefined;
  readonly cervix?: CervixRecord | undefined;
  readonly symptoms?: readonly string[] | undefined;
  readonly mood?: readonly string[] | undefined;
  readonly sex?: "none" | "protected" | "unprotected" | undefined;
  readonly note?: string | undefined;
  readonly updatedAt: number;
}
