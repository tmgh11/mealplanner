/**
 * A recipe's method text → steps and headings.
 *
 * Steps: if the method has blank lines anywhere, each block between blank lines is one step,
 * and single line breaks inside a block stay as line breaks within that step (Paprika and most
 * typed methods). With no blank lines at all, each line is a step (website recipes).
 *
 * Headings: a line written _like this_ is always a heading. A short line ending in a colon
 * ("For the sauce:") is a heading only when it stands on its own; at the top of a block it's
 * just the start of that step ("If air fryer:" followed by its settings).
 */
export interface MethodPart {
  text: string;
  heading?: boolean;
  n?: number;
}

export function methodSteps(method: string): MethodPart[] {
  const text = method.replace(/\r/g, '').trim();
  if (!text) return [];
  const blocks = /\n[ \t]*\n/.test(text) ? text.split(/\n[ \t]*\n/) : text.split('\n');
  const out: MethodPart[] = [];
  let n = 0;
  for (const raw of blocks) {
    const lines = raw
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    if (!lines.length) continue;
    // "_For the sauce_" on its own line, anywhere in a block, is a heading
    while (lines.length && /^_.+_$/.test(lines[0])) out.push({ text: lines.shift()!.slice(1, -1).trim(), heading: true });
    if (!lines.length) continue;
    if (lines.length === 1 && lines[0].endsWith(':') && lines[0].length <= 50) {
      out.push({ text: lines[0].slice(0, -1).trim(), heading: true });
      continue;
    }
    lines[0] = lines[0].replace(/^(step\s*)?\d+[.):]\s*/i, '');
    out.push({ text: lines.join('\n'), n: ++n });
  }
  return out;
}
