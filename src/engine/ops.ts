import type { Roster, Sel } from './types';
import type { Catalog, Def } from './catalog';
import { State, type RNode, type Option } from './state';

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export function clone<T>(x: T): T {
  return JSON.parse(JSON.stringify(x));
}

function findSel(sels: Sel[], u: string): { sel: Sel; list: Sel[] } | undefined {
  for (const s of sels) {
    if (s.uid === u) return { sel: s, list: sels };
    const r = findSel(s.ch, u);
    if (r) return r;
  }
  return undefined;
}

function childList(r: Roster, parentUid: string | null): Sel[] {
  if (!parentUid) return r.sels;
  const f = findSel(r.sels, parentUid);
  if (!f) throw new Error(`selection ${parentUid} not found`);
  return f.sel.ch;
}

/** Add required child selections (min constraints, group defaults) to a freshly added selection. */
function fillDefaults(cat: Catalog, r: Roster, selUid: string, depth = 0, pass = 0) {
  if (depth > 9) return;
  const st = new State(cat, r);
  const node = st.byUid.get(selUid);
  if (!node) return;
  const added: string[] = [];
  const target = findSel(r.sels, selUid)!.sel;
  const addedCount = new Map<string, number>();
  const push = (o: Option, n: number) => {
    const s: Sel = { uid: uid(), id: o.def.id, n, gs: o.gs.length ? o.gs : undefined, ch: [] };
    target.ch.push(s);
    added.push(s.uid);
    addedCount.set(o.def.id, (addedCount.get(o.def.id) ?? 0) + n);
  };
  const visit = (opts: Option[]) => {
    for (const o of opts) {
      if (o.hidden) continue;
      if (o.def.kind === 'group') {
        // entries inside the group that have their own minimum (e.g. "Witchseeker min 4")
        visit(o.children!);
        const have = o.count + flatEntries(o.children!).reduce((t, c) => t + (addedCount.get(c.def.id) ?? 0), 0);
        const need = o.min - have;
        if (need > 0) {
          const visible = flatEntries(o.children!).filter((c) => !c.hidden);
          const pick =
            visible.find((c) => o.def.defaultId && (c.def.id === o.def.defaultId || c.def.targetId === o.def.defaultId)) ??
            (o.def.defaultId === 'none' && visible.length > 1 ? undefined : visible[0]);
          if (pick) push(pick, need);
        }
      } else {
        const def = Number.isFinite(o.defaultAmount) ? (o.defaultAmount as number) : 0;
        const want = o.min > 0 ? Math.max(o.min, def) : 0;
        const need = want - o.count - (addedCount.get(o.def.id) ?? 0);
        if (need > 0) push(o, need);
      }
    }
  };
  visit(st.options(node));
  for (const a of added) fillDefaults(cat, r, a, depth + 1);
  // selections can unlock further required options (e.g. a unit leader unlocking its squad models)
  if (added.length && pass < 4) fillDefaults(cat, r, selUid, depth, pass + 1);
}

function flatEntries(opts: Option[]): Option[] {
  return opts.flatMap((o) => (o.def.kind === 'group' ? flatEntries(o.children ?? []) : [o]));
}

export function addSelection(cat: Catalog, roster: Roster, parentUid: string | null, def: Def, gs: string[] = [], n = 1): { roster: Roster; uid: string } {
  const r = clone(roster);
  const s: Sel = { uid: uid(), id: def.id, n, gs: gs.length ? gs : undefined, ch: [] };
  childList(r, parentUid).push(s);
  fillDefaults(cat, r, s.uid);
  // choices made deeper in the unit can make other options required: sweep the whole unit until stable
  const count = (x: Sel): number => 1 + x.ch.reduce((t, c) => t + count(c), 0);
  for (let i = 0; i < 3; i++) {
    const before = count(s);
    const all: string[] = [];
    const collect = (x: Sel) => { all.push(x.uid); x.ch.forEach(collect); };
    collect(s);
    for (const u of all) fillDefaults(cat, r, u, 8);
    if (count(s) === before) break;
  }
  r.updated = Date.now();
  return { roster: r, uid: s.uid };
}

export function removeSelection(roster: Roster, selUid: string): Roster {
  const r = clone(roster);
  const f = findSel(r.sels, selUid);
  if (!f) return roster;
  f.list.splice(f.list.indexOf(f.sel), 1);
  // drop associations pointing at removed selections
  const alive = new Set<string>();
  const collect = (ss: Sel[]) => ss.forEach((s) => { alive.add(s.uid); collect(s.ch); });
  collect(r.sels);
  const prune = (ss: Sel[]) =>
    ss.forEach((s) => {
      if (s.assoc) for (const k of Object.keys(s.assoc)) s.assoc[k] = s.assoc[k].filter((u) => alive.has(u));
      prune(s.ch);
    });
  prune(r.sels);
  r.updated = Date.now();
  return r;
}

export function setCount(roster: Roster, selUid: string, n: number): Roster {
  if (n <= 0) return removeSelection(roster, selUid);
  const r = clone(roster);
  const f = findSel(r.sels, selUid);
  if (!f) return roster;
  f.sel.n = n;
  r.updated = Date.now();
  return r;
}

/** Select exactly one option within a group (radio behaviour). */
export function chooseInGroup(cat: Catalog, roster: Roster, parentUid: string, group: Option, choice: Option | null): Roster {
  let r = clone(roster);
  const list = childList(r, parentUid);
  const inGroup = list.filter((s) => s.gs?.includes(group.def.id));
  const total = Math.max(1, inGroup.reduce((a, s) => a + s.n, 0));
  for (const s of inGroup) list.splice(list.indexOf(s), 1);
  if (choice) r = addSelection(cat, r, parentUid, choice.def, choice.gs, group.max === 1 ? 1 : total).roster;
  r.updated = Date.now();
  return r;
}

export function duplicateSelection(roster: Roster, selUid: string): Roster {
  const r = clone(roster);
  const f = findSel(r.sels, selUid);
  if (!f) return roster;
  const copy = clone(f.sel);
  const reid = (s: Sel) => { s.uid = uid(); delete s.assoc; s.ch.forEach(reid); };
  reid(copy);
  f.list.splice(f.list.indexOf(f.sel) + 1, 0, copy);
  r.updated = Date.now();
  return r;
}

/** Split one model off a multi-model selection so it can take different wargear. */
export function splitSelection(roster: Roster, selUid: string): Roster {
  const r = clone(roster);
  const f = findSel(r.sels, selUid);
  if (!f || f.sel.n < 2) return roster;
  f.sel.n -= 1;
  const copy = clone(f.sel);
  copy.n = 1;
  const reid = (s: Sel) => { s.uid = uid(); s.ch.forEach(reid); };
  reid(copy);
  f.list.splice(f.list.indexOf(f.sel) + 1, 0, copy);
  r.updated = Date.now();
  return r;
}

export function setAssociation(roster: Roster, selUid: string, assocId: string, targets: string[]): Roster {
  const r = clone(roster);
  const f = findSel(r.sels, selUid);
  if (!f) return roster;
  f.sel.assoc = { ...(f.sel.assoc ?? {}), [assocId]: targets };
  if (!targets.length) delete f.sel.assoc[assocId];
  r.updated = Date.now();
  return r;
}

/** Create a new roster, auto-adding the required army configuration selections. */
export function newRoster(cat: Catalog, name: string, faction: string): Roster {
  let r: Roster = { id: uid(), name, faction, sels: [], created: Date.now(), updated: Date.now() };
  const st = new State(cat, r);
  for (const o of st.rootOptions()) {
    if (o.hidden || o.def.kind === 'group') continue;
    const need = st.constraints(o.def, st.virtual(st.force, o.def)).some(
      (c) => c.type === 'min' && c.value > 0 && c.field === 'selections' && (c.scope === 'roster' || c.scope === 'force' || c.scope === 'parent'),
    );
    if (need) r = addSelection(cat, r, null, o.def).roster;
  }
  return enableOwnContent(cat, r);
}

/**
 * Some armies keep their own units behind "Show ..." toggles (e.g. Chaos Daemons: "Show Khorne Daemons").
 * Switch on the toggles that belong to this army so its units are listed straight away.
 */
function enableOwnContent(cat: Catalog, roster: Roster): Roster {
  const generic = new Set(['chaos', 'imperial', 'imperium', 'show', 'the', 'of']);
  const words = new Set(cat.data.name.toLowerCase().split(/[^a-z]+/).filter((w) => w && !generic.has(w)));
  let r = roster;
  let st = new State(cat, r);
  const sh = st.rootOptions().find((o) => o.name === 'Show/Hide Options' && !o.hidden);
  if (!sh) return r;
  const toggles = (n: RNode) =>
    flatEntries(st.options(n)).filter(
      (o) => !o.hidden && o.count === 0 && /^Show /.test(o.def.name) && o.def.name.toLowerCase().split(/[^a-z]+/).some((w) => words.has(w)),
    );
  const probe = addSelection(cat, r, null, sh.def);
  st = new State(cat, probe.roster);
  const list = toggles(st.byUid.get(probe.uid)!);
  if (!list.length) return r;
  r = probe.roster;
  for (const o of list) r = addSelection(cat, r, probe.uid, o.def, o.gs).roster;
  return r;
}

export function findNode(st: State, u: string): RNode | undefined {
  return st.byUid.get(u);
}
