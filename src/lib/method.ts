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

/**
 * Recipe sites often put tips, storage and freezing advice after the method, under a heading
 * like "Tips for how to make…", "Can you freeze it?" or "Storage". That isn't part of cooking:
 * everything from such a heading on belongs in the notes.
 */
const EXTRAS = /^(_)?((top |recipe |cook'?s |chef'?s |our |expert )?tips?(?=\s*($|:|_|for\b|and\b|&|on\b))|(recipe |cook'?s )?notes?(?=\s*($|:|_))|can (you|i) (freeze|make|store|keep)|how (to|do you|long) (store|freeze|keep|reheat)|storage\b|storing\b|to store\b|freezing\b|to freeze\b|make[- ]ahead\b|serving suggestions?\b|faqs?\b|variations?\b|substitutions?\b|nutrition\b)/i;

export function splitExtras(method: string): { method: string; extras?: string } {
  const text = method.replace(/\r/g, '');
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].trim();
    // a short heading-like line, on its own (after a blank line, or any line when the method has none)
    const alone = !lines[i - 1]?.trim() || !/\n\s*\n/.test(text);
    if (i > 0 && l.length <= 70 && !/[.!]$/.test(l) && EXTRAS.test(l) && alone) {
      const before = lines.slice(0, i).join('\n').trim();
      if (!before) return { method: text };
      return { method: before, extras: lines.slice(i).join('\n').trim() };
    }
  }
  return { method: text };
}

/** Moves tips found at the end of a recipe's method into its notes. Null if there are none. */
export function moveExtrasToNotes<T extends { method: string; notes?: string }>(r: T): T | null {
  const { method, extras } = splitExtras(r.method);
  if (!extras) return null;
  return { ...r, method, notes: [r.notes?.trim(), extras].filter(Boolean).join('\n\n') };
}
