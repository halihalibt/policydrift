export function timeLabel(epochSeconds: number): string {
  return epochSeconds > 0 ? new Date(epochSeconds * 1000).toLocaleString() : 'Never'
}

export function sourceDomain(url: string): string {
  try { return new URL(url).hostname } catch { return url }
}

export function sameAddress(a: string, b: string): boolean {
  return Boolean(a && b) && a.toLowerCase() === b.toLowerCase()
}
