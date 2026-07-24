// Chemist Care Pharmacy Opportunity Scout — controlled language.
// Do not use "Eligible", "Ineligible", "Underperforming", or similar.

export const SCREENING_LANGUAGE = {
  appears_to_satisfy: "Appears to satisfy",
  does_not_appear_to_satisfy: "Does not appear to satisfy",
  insufficient_evidence: "Insufficient evidence",
  professional_measurement_required: "Professional measurement required",
  not_applicable: "Not applicable",
} as const;

export const COMMERCIAL_LANGUAGE = {
  operational_upside_potential: "Operational upside potential",
  market_headroom: "Market headroom",
  relocation_uplift_potential: "Relocation uplift potential",
  commercial_data_required: "Commercial data required",
} as const;

export const SCREENING_DISCLAIMER =
  "Preliminary screening only. ACPA and the Department determine whether an application satisfies the Pharmacy Location Rules.";

export const FULL_DISCLAIMER =
  "Preliminary decision-support tool only. Results are based on available data, user inputs and automated measurements. They are not legal, surveying, financial or regulatory advice and do not determine whether ACPA, the Department of Health, Disability and Ageing or the Victorian Pharmacy Authority will approve an application. Verify all requirements against current legislation, official guidance and appropriately qualified advisers.";
