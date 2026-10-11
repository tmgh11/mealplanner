/**
 * A small .xlsx reader: just the text of each sheet's cells, which is all the menu import needs.
 * An .xlsx file is a zip of XML files; fflate unzips it in the browser.
 */
import { strFromU8, unzipSync } from 'fflate';

export interface Sheet {
  name: string;
  /** rows[r][c] = the cell's text ('' if empty), 0-based */
  rows: string[][];
}

const decode = (s: string) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&');

/** All the <t> text inside a fragment (shared strings can be split into rich-text runs). */
const texts = (xml: string) => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => decode(m[1])).join('');

const colIndex = (ref: string) => {
  const letters = ref.match(/^[A-Z]+/)![0];
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
};

export function readXlsx(data: Uint8Array): Sheet[] {
  const files = unzipSync(data);
  const file = (path: string) => (files[path] ? strFromU8(files[path]) : '');
  const shared = [...file('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => texts(m[1]));

  const rels = new Map<string, string>();
  for (const m of file('xl/_rels/workbook.xml.rels').matchAll(/<Relationship\b[^>]*>/g)) {
    const id = m[0].match(/\bId="([^"]+)"/)?.[1];
    const target = m[0].match(/\bTarget="([^"]+)"/)?.[1];
    if (id && target) rels.set(id, target.replace(/^\/?(xl\/)?/, 'xl/'));
  }

  const sheets: Sheet[] = [];
  for (const m of file('xl/workbook.xml').matchAll(/<sheet\b[^>]*\/?>/g)) {
    const name = decode(m[0].match(/\bname="([^"]*)"/)?.[1] ?? 'Sheet');
    const rid = m[0].match(/\br:id="([^"]+)"/)?.[1];
    const xml = file(rels.get(rid ?? '') ?? '');
    const rows: string[][] = [];
    for (const c of xml.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[1];
      const ref = attrs.match(/\br="([A-Z]+)(\d+)"/);
      if (!ref) continue;
      const body = c[2] ?? '';
      const type = attrs.match(/\bt="([^"]+)"/)?.[1];
      const v = body.match(/<v>([\s\S]*?)<\/v>/)?.[1];
      let text = '';
      if (type === 's' && v != null) text = shared[Number(v)] ?? '';
      else if (type === 'inlineStr') text = texts(body);
      else if (v != null) text = decode(v);
      if (!text.trim()) continue;
      const r = Number(ref[2]) - 1;
      const col = colIndex(ref[1]);
      while (rows.length <= r) rows.push([]);
      const row = rows[r];
      while (row.length <= col) row.push('');
      row[col] = text;
    }
    sheets.push({ name, rows });
  }
  return sheets;
}
