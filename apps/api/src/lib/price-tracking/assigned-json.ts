// Read JSON data only. Never execute retailer JavaScript.
export function extractAssignedJsonObject(html: string, variableName: string): string | null {
  const escaped = variableName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const matches = [...html.matchAll(new RegExp(`(?:var|let|const)\\s+${escaped}\\s*=\\s*`, 'gi'))];
  if (matches.length !== 1) return null;
  const match = matches[0]!;
  const start = match.index! + match[0].length;
  if (html[start] !== '{') return null;
  let depth = 0, quoted = false, escapedChar = false;
  for (let i = start; i < html.length; i++) {
    const char = html[i];
    if (quoted) {
      if (escapedChar) escapedChar = false;
      else if (char === '\\') escapedChar = true;
      else if (char === '"') quoted = false;
    } else if (char === '"') quoted = true;
    else if (char === '{') depth++;
    else if (char === '}' && --depth === 0) return html.slice(start, i + 1);
  }
  return null;
}
