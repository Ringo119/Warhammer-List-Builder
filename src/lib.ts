import { useEffect, useState, useSyncExternalStore } from 'react';
import { Catalog } from './engine/catalog';
import { State, type RNode } from './engine/state';
import type { FactionData, Roster } from './engine/types';

// ------------------------------------------------------------------ data
export interface FactionIndex {
  generatedAt: string;
  sources: { bsdata: { repo: string; commit: string }; wahapedia: { note: string; lastUpdate: string } };
  factions: { key: string; name: string; alliance: string; file: string; size: number }[];
}

const base = import.meta.env.BASE_URL;
let indexPromise: Promise<FactionIndex> | undefined;
export function loadIndex() {
  indexPromise ??= fetch(`${base}data/index.json`).then((r) => {
    if (!r.ok) throw new Error(`Could not load data index (${r.status})`);
    return r.json();
  });
  return indexPromise;
}

const catalogs = new Map<string, Promise<Catalog>>();
export function loadCatalog(key: string) {
  if (!catalogs.has(key)) {
    catalogs.set(
      key,
      loadIndex()
        .then((idx) => {
          const f = idx.factions.find((x) => x.key === key);
          if (!f) throw new Error(`Unknown faction ${key}`);
          return fetch(`${base}data/${f.file}`);
        })
        .then((r) => r.json() as Promise<FactionData>)
        .then((d) => new Catalog(d)),
    );
  }
  return catalogs.get(key)!;
}

export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [state, setState] = useState<{ value?: T; error?: Error }>({});
  useEffect(() => {
    let alive = true;
    setState({});
    fn().then(
      (value) => alive && setState({ value }),
      (error) => alive && setState({ error }),
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}

// ------------------------------------------------------------------ roster storage
const KEY = 'wlb.rosters.v1';
let rosters: Roster[] = read();
const listeners = new Set<() => void>();

function read(): Roster[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]');
  } catch {
    return [];
  }
}

function emit() {
  try {
    localStorage.setItem(KEY, JSON.stringify(rosters));
  } catch {
    /* storage full / unavailable */
  }
  listeners.forEach((l) => l());
}

export const store = {
  all: () => rosters,
  get: (id: string) => rosters.find((r) => r.id === id),
  put(r: Roster) {
    const i = rosters.findIndex((x) => x.id === r.id);
    rosters = i >= 0 ? rosters.map((x) => (x.id === r.id ? r : x)) : [r, ...rosters];
    emit();
  },
  remove(id: string) {
    rosters = rosters.filter((r) => r.id !== id);
    emit();
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === KEY) {
      rosters = read();
      listeners.forEach((l) => l());
    }
  });
}

export function useRosters() {
  return useSyncExternalStore(store.subscribe, store.all);
}

// ------------------------------------------------------------------ routing (hash based: works on GitHub Pages and with the back button)
function getHash() {
  return location.hash.replace(/^#\/?/, '');
}
export function useRoute() {
  const [h, setH] = useState(getHash());
  useEffect(() => {
    const f = () => setH(getHash());
    window.addEventListener('hashchange', f);
    return () => window.removeEventListener('hashchange', f);
  }, []);
  return h.split('/').map(decodeURIComponent);
}
export function go(path: string, replace = false) {
  const url = `#/${path}`;
  if (replace) history.replaceState(null, '', url);
  else location.hash = url;
  if (replace) window.dispatchEvent(new HashChangeEvent('hashchange'));
}
export function back(fallback = '') {
  if (history.length > 1 && document.referrer !== undefined && sessionStorage.getItem('wlb.nav')) history.back();
  else go(fallback, true);
}
// mark that in-app navigation happened, so "back" can use history
if (typeof window !== 'undefined') window.addEventListener('hashchange', () => sessionStorage.setItem('wlb.nav', '1'));

// ------------------------------------------------------------------ helpers
export const norm = (s: string) =>
  s.toLowerCase().replace(/\[legends\]/g, '').replace(/[’'`]/g, '').replace(/[^a-z0-9]/g, '');

export const fmt = (n: number) => n.toLocaleString('en-GB');

export const SECTION_ORDER = ['Characters', 'Battleline', 'Dedicated Transports', 'Other Datasheets', 'Allied Units', 'Fortifications'];

export function sectionFor(st: State, node: RNode) {
  const p = st.primaryCategory(node);
  const name = p ? st.cat.categoryName(p) : '';
  return sectionForCategory(name);
}
export function sectionForCategory(name: string) {
  if (/^Allies/.test(name)) return 'Allied Units';
  if (name === 'Character' || name === 'Epic Hero') return 'Characters';
  if (name === 'Battleline') return 'Battleline';
  if (name === 'Dedicated Transport') return 'Dedicated Transports';
  if (name === 'Fortification') return 'Fortifications';
  if (name === 'Configuration' || name === 'Reference') return 'Configuration';
  return 'Other Datasheets';
}

export function isConfig(st: State, node: RNode) {
  return sectionFor(st, node) === 'Configuration';
}

/** Selected detachment names */
export function detachments(st: State) {
  const out: { name: string; dp: number }[] = [];
  for (const top of st.topLevel()) {
    if (top.def.name !== 'Detachment') continue;
    const visit = (n: RNode) =>
      n.children.forEach((c) => {
        out.push({ name: st.name(c), dp: st.totalCost(c, st.cat.dpId) });
        visit(c);
      });
    visit(top);
  }
  return out;
}

export function battleSize(st: State) {
  const bs = st.topLevel().find((n) => n.def.name === 'Battle Size' || n.def.targetId === '564e-fbc6-5266-3ea4');
  const c = bs?.children.find((x) => /\(\d+ Point limit\)/.test(x.def.name));
  if (!c) return undefined;
  const m = /^\d+\.\s*(.*?)\s*\((\d+) Point limit\)/.exec(st.name(c));
  return m ? { name: m[1], points: Number(m[2]) } : { name: st.name(c), points: 0 };
}

export function isEnhancement(st: State, n: RNode) {
  return (st.ev(n).costs.get(st.cat.enhId) ?? 0) > 0 || n.sel?.gs?.some((g) => /Enhancement/i.test(st.cat.getDef(g)?.name ?? ''));
}

export function unitSummary(st: State, node: RNode) {
  const tags: string[] = [];
  let models = 0;
  let enhancement: string | undefined;
  let warlord = false;
  const visit = (n: RNode, mult: number) => {
    for (const c of n.children) {
      if (c.def.type === 'model') models += c.n * mult;
      if (c.def.name === 'Warlord') warlord = true;
      else if (isEnhancement(st, c)) enhancement = st.name(c);
      visit(c, mult * c.n);
    }
  };
  if (node.def.type === 'model') models = node.n;
  visit(node, 1);
  if (warlord) tags.push('Warlord');
  if (enhancement) tags.push(enhancement);
  return { models, enhancement, warlord, tags };
}

export function useStateFor(cat: Catalog | undefined, roster: Roster | undefined) {
  if (!cat || !roster) return undefined;
  return new State(cat, roster);
}

export function vibrate() {
  try {
    navigator.vibrate?.(8);
  } catch {
    /* ignore */
  }
}
