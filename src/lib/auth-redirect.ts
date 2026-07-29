export function safeSameOriginPath(value: string | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return "/app";
  }
  try {
    const url = new URL(value, "https://local.invalid");
    return url.origin === "https://local.invalid"
      ? `${url.pathname}${url.search}${url.hash}`
      : "/app";
  } catch {
    return "/app";
  }
}
