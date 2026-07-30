export function vpaDisplayDate(value: string | null): string {
  return value ? new Date(`${value}T00:00:00`).toLocaleDateString("en-AU") : "Not published";
}

export function vpaRegistrationDueWording(value: string | null, now = new Date()): string | null {
  if (!value) return null;
  const days = Math.ceil((new Date(`${value}T00:00:00`).valueOf() - now.valueOf()) / 86_400_000);
  if (days < 0) {
    return "The published registration date has passed. Confirm current renewal status with the Victorian Pharmacy Authority.";
  }
  if (days > 90) return null;
  if (days === 0) {
    return "The published registration date is due today. Confirm current renewal status with the Victorian Pharmacy Authority.";
  }
  return `Published registration date is due within ${days} days. Confirm current renewal status with the Victorian Pharmacy Authority.`;
}

export function registeredLicenseeSummary(
  currentCount: number,
  state: "loaded" | "sign_in_required" | "unavailable" = "loaded",
): string {
  if (state === "sign_in_required") {
    return "Sign in to view published registered-licensee information.";
  }
  if (state === "unavailable") {
    return "Published registered-licensee information is temporarily unavailable.";
  }
  if (currentCount === 0) {
    return "No registered licensee is currently published for this premises. None has been inferred.";
  }
  return currentCount === 1
    ? "One registered licensee is currently listed."
    : `${currentCount} registered licensees are currently listed.`;
}
