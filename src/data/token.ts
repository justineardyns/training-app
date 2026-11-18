// Vervaldatum van je GitHub-token (header "github-authentication-token-expiration").

/** "2027-11-01 10:00:00 UTC" → Date (of undefined). */
export function parseExpiry(header: string | undefined): Date | undefined {
  if (!header) return undefined;
  const iso = header.trim().replace(' UTC', 'Z').replace(' ', 'T').replace(/ ([+-]\d{4})$/, '$1');
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/** Dagen tot het token vervalt (negatief = verlopen). */
export function daysLeft(header: string | undefined, now = new Date()): number | undefined {
  const d = parseExpiry(header);
  return d ? Math.floor((d.getTime() - now.getTime()) / 86_400_000) : undefined;
}
