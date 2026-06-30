/**
 * Burbank residential permit-parking streets (Zones A–H).
 * Derived from the City's Residential Parking Permit Zone Map (2022).
 * Street-name match is a screening heuristic — block-level signs govern eligibility.
 */
export const BURBANK_PERMIT_PARKING_STREETS: {
  street: string;
  zone: string;
}[] = [
  { street: "reese", zone: "A" },
  { street: "brighton", zone: "A" },
  { street: "kenwood", zone: "A" },
  { street: "elm", zone: "A" },
  { street: "pass", zone: "A" },
  { street: "valley", zone: "A" },
  { street: "lincoln", zone: "A" },
  { street: "rose", zone: "A" },
  { street: "evergreen", zone: "A" },
  { street: "frederic", zone: "A" },
  { street: "ontario", zone: "A" },
  { street: "keystone", zone: "A" },
  { street: "naomi", zone: "A" },
  { street: "cordova", zone: "A" },
  { street: "myers", zone: "A" },
  { street: "avon", zone: "A" },
  { street: "lima", zone: "A" },
  { street: "pepper", zone: "B" },
  { street: "scott", zone: "B" },
  { street: "tujunga", zone: "B" },
  { street: "clybourn", zone: "B" },
  { street: "linden", zone: "B" },
  { street: "hood", zone: "B" },
  { street: "elmwood", zone: "B" },
  { street: "lamer", zone: "B" },
  { street: "palm", zone: "B" },
  { street: "griffith park", zone: "C" },
  { street: "orange grove", zone: "C" },
  { street: "ford", zone: "C" },
  { street: "edison", zone: "C" },
  { street: "providencia", zone: "C" },
  { street: "tulare", zone: "C" },
  { street: "buena vista", zone: "C" },
  { street: "thorton", zone: "C" },
  { street: "toluca lake", zone: "C" },
  { street: "irving", zone: "D" },
  { street: "beachwood", zone: "D" },
  { street: "santa anita", zone: "D" },
  { street: "lakeside", zone: "D" },
  { street: "pacific", zone: "D" },
  { street: "mariposa", zone: "D" },
  { street: "oak", zone: "D" },
  { street: "san jose", zone: "D" },
  { street: "fairmount", zone: "D" },
  { street: "kenneth", zone: "D" },
  { street: "glenwood", zone: "E" },
  { street: "valley heart", zone: "E" },
  { street: "franklin", zone: "E" },
  { street: "leland", zone: "E" },
  { street: "florence", zone: "E" },
  { street: "spazier", zone: "E" },
  { street: "doan", zone: "E" },
  { street: "lomita", zone: "E" },
  { street: "valencia", zone: "E" },
  { street: "fifth", zone: "E" },
  { street: "maple", zone: "F" },
  { street: "catalina", zone: "F" },
  { street: "sparks", zone: "F" },
  { street: "chavez", zone: "F" },
  { street: "clark", zone: "F" },
  { street: "screenland", zone: "F" },
  { street: "parish", zone: "F" },
  { street: "niagara", zone: "G" },
  { street: "lutge", zone: "G" },
  { street: "fairview", zone: "G" },
  { street: "peyton", zone: "G" },
  { street: "national", zone: "G" },
  { street: "mcfarlane", zone: "G" },
  { street: "magnolia", zone: "H" },
  { street: "hollywood", zone: "H" },
  { street: "victory", zone: "H" },
  { street: "verdugo", zone: "H" },
  { street: "olive", zone: "H" },
  { street: "orchard", zone: "H" },
  { street: "glenoaks", zone: "H" },
  { street: "main", zone: "H" },
  { street: "burbank", zone: "H" },
  { street: "alameda", zone: "H" },
  { street: "california", zone: "H" },
  { street: "riverside", zone: "H" },
  { street: "warner", zone: "H" },
];

const STREET_LOOKUP = new Map(
  BURBANK_PERMIT_PARKING_STREETS.map((s) => [normalizeStreetToken(s.street), s.zone])
);

function normalizeStreetToken(value: string): string {
  return value
    .toLowerCase()
    .replace(/\b(north|south|east|west|n|s|e|w)\b/g, "")
    .replace(
      /\b(street|st|avenue|ave|boulevard|blvd|drive|dr|road|rd|lane|ln|way|place|pl|court|ct|circle|cir|highway|hwy)\b/g,
      ""
    )
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

/** Extract and normalize street name from a situs address. */
export function extractStreetName(address: string): string | null {
  const trimmed = address.trim();
  if (!trimmed) return null;

  const withoutCity = trimmed.replace(/,?\s*Burbank.*$/i, "").trim();
  const match = withoutCity.match(/^\d+\s+(.+)$/);
  if (!match) return null;

  const normalized = normalizeStreetToken(match[1]);
  return normalized || null;
}

export function matchPermitParkingStreet(address: string): {
  matched: boolean;
  zone?: string;
  street?: string;
} {
  const streetKey = extractStreetName(address);
  if (!streetKey) return { matched: false };

  for (const entry of BURBANK_PERMIT_PARKING_STREETS) {
    const key = normalizeStreetToken(entry.street);
    if (streetKey.includes(key) || key.includes(streetKey)) {
      return { matched: true, zone: entry.zone, street: entry.street };
    }
  }

  const zone = STREET_LOOKUP.get(streetKey);
  if (zone) {
    return { matched: true, zone, street: streetKey };
  }

  return { matched: false };
}
