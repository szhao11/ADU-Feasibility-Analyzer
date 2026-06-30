/** Parse a single search box value as street address or APN/AIN. */
export function parsePropertySearch(query: string): {
  address: string;
  ain?: string;
} {
  const trimmed = query.trim();
  if (!trimmed) return { address: "" };

  const normalized = trimmed.replace(/\s+/g, "");
  const apnFormatted = /^\d{4}-?\d{3}-?\d{3}$/.test(normalized);
  const ainDigits = /^\d{10}$/.test(normalized);

  if (apnFormatted || ainDigits) {
    const ain = normalized.replace(/-/g, "");
    return { address: "", ain };
  }

  return { address: trimmed };
}

export function propertySearchDisplayValue(property: {
  address: string;
  apn?: string;
}): string {
  return property.address.trim() || property.apn?.trim() || "";
}
