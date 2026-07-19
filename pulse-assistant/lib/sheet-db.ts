/**
 * Google Sheets Project Database Fetcher
 * Fetches Colladome's project database from Google Sheets (CSV export)
 * Sheet must be set to "Anyone with the link can view"
 */

const SHEET_ID = "1ia6WJQ1E1adh8LKp6Ev5tju3aydW7CpJCXzo1k03CME";
const SHEET_GID = "0";

// Cache for 10 minutes to avoid hitting Google on every message
let cachedData: string | null = null;
let cacheTimestamp: number = 0;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

export async function fetchProjectDatabase(): Promise<string> {
  const now = Date.now();

  // Return cached data if still fresh
  if (cachedData && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedData;
  }

  const csvUrl = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${SHEET_GID}`;

  try {
    const res = await fetch(csvUrl);
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        return "PROJECT DATABASE: Sheet is private. Please make the Google Sheet public (Anyone with link → Viewer) to enable project database sync.";
      }
      throw new Error(`Sheet fetch failed: ${res.status}`);
    }

    const csv = await res.text();
    const formatted = parseCSVToReadable(csv);

    // Update cache
    cachedData = formatted;
    cacheTimestamp = now;

    return formatted;
  } catch (err: any) {
    console.error("Sheet fetch error:", err.message);
    return `PROJECT DATABASE: Could not load (${err.message}). Check if sheet is public.`;
  }
}

/**
 * Parses CSV into a structured readable format for the AI prompt
 */
function parseCSVToReadable(csv: string): string {
  const lines = csv.trim().split("\n").map(l => l.split(",").map(c => c.trim().replace(/^"|"$/g, "")));

  if (lines.length < 2) return "PROJECT DATABASE: Sheet appears empty.";

  const headers = lines[0];
  const rows = lines.slice(1).filter(row => row.some(cell => cell.length > 0));

  if (rows.length === 0) return "PROJECT DATABASE: No project data found in sheet.";

  const projects = rows.map((row, i) => {
    const project: Record<string, string> = {};
    headers.forEach((header, idx) => {
      if (row[idx]) project[header] = row[idx];
    });
    return `Project ${i + 1}:\n${Object.entries(project).map(([k, v]) => `  ${k}: ${v}`).join("\n")}`;
  });

  return `COLLADOME PROJECT DATABASE (${rows.length} projects, live from Google Sheets):\n\n${projects.join("\n\n")}`;
}

/**
 * Force refresh the cache (call when user asks to refresh database)
 */
export function clearSheetCache(): void {
  cachedData = null;
  cacheTimestamp = 0;
}
