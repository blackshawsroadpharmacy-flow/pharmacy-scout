export interface PharmacyIntelligenceSummaryInput {
  experimental_scripts_day: number | null | undefined;
  principal_reason: string | null | undefined;
}

export interface PharmacyIntelligenceSummary {
  estimateLabel: string | null;
  topInsight: string | null;
}

export function pharmacyIntelligenceSummary(
  input: PharmacyIntelligenceSummaryInput,
): PharmacyIntelligenceSummary {
  const estimate = Number(input.experimental_scripts_day);
  const hasEstimate =
    input.experimental_scripts_day != null && Number.isFinite(estimate) && estimate >= 0;
  const insight = input.principal_reason?.trim();

  return {
    estimateLabel: hasEstimate
      ? `${Math.round(estimate).toLocaleString("en-AU")} estimated scripts/day`
      : null,
    topInsight: insight || null,
  };
}
