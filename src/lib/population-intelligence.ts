export type PopulationMetric = "density" | "growth";

export interface PopulationProperties {
  sa2_code_2021: number;
  sa2_name_2021: string;
  pop_yr1: number | null;
  pop_yr2: number | null;
  chg_yr_to_yr_no: number | null;
  chg_y_to_y: number | null;
  area_km2: number | null;
  pop_dens_yr: number | null;
}

export interface PopulationFeatureCollection {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    geometry: GeoJSON.Geometry;
    properties: PopulationProperties;
  }>;
}

export const ABS_POPULATION_SOURCE =
  "https://geo.abs.gov.au/arcgis/rest/services/Hosted/SA2_RP_2024/FeatureServer/0";

export const ABS_POPULATION_PROVENANCE = {
  publisher: "Australian Bureau of Statistics",
  dataset: "Regional Population 2023–24 — SA2_RP_2024",
  geography: "ASGS Edition 3, Statistical Areas Level 2 (2021)",
  referencePeriod: "ERP 2024 and annual change 2023–24",
  licence: "Creative Commons Attribution 4.0 International",
  licenceUrl: "https://creativecommons.org/licenses/by/4.0/",
  copyrightUrl: "https://www.abs.gov.au/about-us/abs-copyright-and-long-form-copyright-notices",
  attribution: "Source: Australian Bureau of Statistics",
} as const;

const QUERY = new URLSearchParams({
  where: "sa2_code_2021 >= 200000000 AND sa2_code_2021 < 300000000",
  outFields:
    "sa2_code_2021,sa2_name_2021,pop_yr1,pop_yr2,chg_yr_to_yr_no,chg_y_to_y,area_km2,pop_dens_yr",
  returnGeometry: "true",
  outSR: "4326",
  maxAllowableOffset: "0.002",
  geometryPrecision: "5",
  f: "geojson",
});

export async function fetchVictorianPopulation(
  signal?: AbortSignal,
): Promise<PopulationFeatureCollection> {
  const response = await fetch(`${ABS_POPULATION_SOURCE}/query?${QUERY}`, { signal });
  if (!response.ok) throw new Error(`ABS population service returned ${response.status}`);
  const body = (await response.json()) as PopulationFeatureCollection;
  if (body.type !== "FeatureCollection" || !Array.isArray(body.features)) {
    throw new Error("ABS population service returned an unexpected response");
  }
  return body;
}

export function populationColour(metric: PopulationMetric, value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "#d1d5db";
  const breaks: Array<[number, string]> =
    metric === "growth"
      ? [
          [-1, "#991b1b"],
          [0, "#ef4444"],
          [1, "#fde68a"],
          [2, "#86efac"],
          [4, "#22c55e"],
        ]
      : [
          [10, "#eff6ff"],
          [100, "#bfdbfe"],
          [500, "#60a5fa"],
          [2_000, "#2563eb"],
          [5_000, "#1d4ed8"],
        ];
  return (
    breaks.find(([limit]) => value < limit)?.[1] ?? (metric === "growth" ? "#166534" : "#172554")
  );
}

export function populationValue(
  properties: PopulationProperties,
  metric: PopulationMetric,
): number | null {
  return metric === "density" ? properties.pop_dens_yr : properties.chg_y_to_y;
}
