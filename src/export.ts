import type { State, RNode } from './engine/state';
import type { Roster, Sel } from './engine/types';
import { battleSize, detachments, isConfig, isEnhancement, sectionFor, SECTION_ORDER } from './lib';
import { uid } from './engine/ops';

/** Plain text export in the style of the official app. */
export function exportText(st: State, roster: Roster) {
  const lines: string[] = [];
  const lim = st.limits();
  lines.push(`${roster.name} (${lim.points} Points)`);
  lines.push('');
  lines.push(st.cat.data.name);
  const bs = battleSize(st);
  if (bs) lines.push(`${bs.name} (${bs.points} Points)`);
  const dets = detachments(st).filter((d) => d.dp > 0 || !/Detachments \(/.test(d.name));
  for (const d of dets) lines.push(d.name);
  lines.push('');
  const units = st.topLevel().filter((n) => !isConfig(st, n));
  for (const section of SECTION_ORDER) {
    const list = units.filter((n) => sectionFor(st, n) === section);
    if (!list.length) continue;
    lines.push('');
    lines.push(section.toUpperCase());
    lines.push('');
    for (const u of list) {
      lines.push(`${st.name(u)} (${st.points(u)} Points)`);
      unitLines(st, u, lines);
      const attached = st.attachedTo(u);
      if (attached.length) lines.push(`  • Attached: ${attached.map((a) => st.name(a)).join(', ')}`);
      lines.push('');
    }
  }
  lines.push('');
  lines.push(`Exported with Warhammer List Builder`);
  return lines.join('\n');
}

function unitLines(st: State, u: RNode, lines: string[]) {
  const childLine = (c: RNode, indent: string, mult: number) => {
    if (c.def.name === 'Warlord') lines.push(`${indent}• Warlord`);
    else if (isEnhancement(st, c)) lines.push(`${indent}• Enhancements: ${st.name(c)}`);
    else lines.push(`${indent}• ${c.n * mult}x ${st.name(c)}`);
  };
  for (const c of u.children) {
    childLine(c, '  ', 1);
    for (const g of c.children) {
      lines.push(`      ◦ ${g.n * c.n}x ${st.name(g)}`);
    }
  }
}

// ------------------------------------------------------------------ share codes (exact round trip)
interface Packed {
  v: 1;
  f: string;
  n: string;
  s: unknown[];
}

function packSel(s: Sel, refs: Set<string>): unknown[] {
  const a: unknown[] = [s.id, s.n, s.ch.map((c) => packSel(c, refs))];
  const keepUid = refs.has(s.uid) || !!s.assoc;
  if (s.gs?.length || s.assoc || keepUid) a.push(s.gs ?? 0);
  if (s.assoc || keepUid) a.push(s.assoc ?? 0);
  if (keepUid) a.push(s.uid);
  return a;
}

function unpackSel(a: unknown[], uidMap: Map<string, string>): Sel {
  const [id, n, ch, gs, assoc, oldUid] = a as [string, number, unknown[][], string[] | 0, Record<string, string[]> | 0 | undefined, string | undefined];
  const s: Sel = { uid: uid(), id, n, ch: ch.map((c) => unpackSel(c, uidMap)) };
  if (gs) s.gs = gs;
  if (assoc) s.assoc = assoc as Record<string, string[]>;
  if (oldUid) uidMap.set(oldUid, s.uid);
  return s;
}

async function deflate(text: string) {
  const bytes = new TextEncoder().encode(text);
  if (typeof CompressionStream === 'undefined') return 'r' + b64(bytes);
  const cs = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  const out = new Uint8Array(await new Response(cs).arrayBuffer());
  return 'z' + b64(out);
}

async function inflate(code: string) {
  const kind = code[0];
  const bytes = unb64(code.slice(1));
  if (kind === 'r') return new TextDecoder().decode(bytes);
  const ds = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new TextDecoder().decode(await new Response(ds).arrayBuffer());
}

function b64(bytes: Uint8Array) {
  let s = '';
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function unb64(s: string) {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

export async function toShareCode(r: Roster) {
  const refs = new Set<string>();
  const collect = (ss: Sel[]) => ss.forEach((x) => { Object.values(x.assoc ?? {}).forEach((t) => t.forEach((u) => refs.add(u))); collect(x.ch); });
  collect(r.sels);
  const packed: Packed = { v: 1, f: r.faction, n: r.name, s: r.sels.map((x) => packSel(x, refs)) };
  return deflate(JSON.stringify(packed));
}

export async function fromShareCode(code: string): Promise<Roster> {
  const clean = code.trim().replace(/^.*#\/import\//, '');
  const p = JSON.parse(await inflate(clean)) as Packed;
  if (p.v !== 1) throw new Error('Unsupported code version');
  const uidMap = new Map<string, string>();
  const sels = (p.s as unknown[][]).map((s) => unpackSel(s, uidMap));
  const remap = (ss: Sel[]) =>
    ss.forEach((s) => {
      if (s.assoc) for (const k of Object.keys(s.assoc)) s.assoc[k] = s.assoc[k].map((u) => uidMap.get(u) ?? u);
      remap(s.ch);
    });
  remap(sels);
  return { id: uid(), name: p.n, faction: p.f, sels, created: Date.now(), updated: Date.now() };
}
