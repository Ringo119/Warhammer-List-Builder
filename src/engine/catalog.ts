/* eslint-disable @typescript-eslint/no-explicit-any */
import type { BsNode, FactionData } from './types';

/** An option that can be selected: an entry or a group, possibly reached through an entry link. */
export interface Def {
  /** id stored on selections: link id when reached through a link, otherwise the entry/group id */
  id: string;
  /** id of the entry / group itself */
  targetId: string;
  kind: 'entry' | 'group';
  node: BsNode;
  link?: BsNode;
  name: string;
  /** unit | model | upgrade (entries only) */
  type?: string;
  constraints: BsNode[];
  modifiers: BsNode[];
  modifierGroups: BsNode[];
  categoryLinks: BsNode[];
  costs: BsNode[];
  profiles: BsNode[];
  rules: BsNode[];
  infoLinks: BsNode[];
  infoGroups: BsNode[];
  associations: BsNode[];
  hidden: boolean;
  collective: boolean;
  defaultId?: string;
  sortIndex: number;
  _children?: Def[];
}

const arr = (x: any): any[] => (Array.isArray(x) ? x : []);

export class Catalog {
  data: FactionData;
  byId = new Map<string, BsNode>();
  defs = new Map<string, Def>();
  categories = new Map<string, string>();
  costTypes: { id: string; name: string }[];
  ptsId: string;
  dpId: string;
  enhId: string;
  forceEntry: BsNode;
  forceDef: Def;
  primaryCatalogueId: string;
  primaryCatalogue: BsNode;

  constructor(data: FactionData) {
    this.data = data;
    this.primaryCatalogueId = data.primaryCatalogueId;
    this.primaryCatalogue = data.catalogues.find((c) => c.id === data.primaryCatalogueId);
    // primary catalogue first so its ids win on collisions
    const docs = [this.primaryCatalogue, data.gameSystem, ...data.catalogues.filter((c) => c !== this.primaryCatalogue)];
    for (const d of docs) this.index(d);
    for (const d of docs) for (const c of arr(d.categoryEntries)) this.categories.set(c.id, c.name);
    this.costTypes = arr(data.gameSystem.costTypes).map((c: any) => ({ id: c.id, name: c.name }));
    const ct = (n: string) => this.costTypes.find((c) => c.name === n)?.id ?? n;
    this.ptsId = ct('pts');
    this.dpId = ct('Detachment Points');
    this.enhId = ct('Enhancements');
    this.forceEntry = arr(data.gameSystem.forceEntries).find((f: any) => f.name === 'Army Roster') ?? arr(data.gameSystem.forceEntries)[0];

    // root options available in the force
    const roots: Def[] = [];
    const seenCat = new Set<string>();
    const seenTarget = new Set<string>();
    const configCats = new Set([...this.categories].filter(([, n]) => n === 'Configuration' || n === 'Reference').map(([id]) => id));
    const addRoots = (doc: BsNode, imported = false) => {
      if (!doc || seenCat.has(doc.id)) return;
      seenCat.add(doc.id);
      const push = (d: Def) => {
        if (!d || seenTarget.has(d.targetId)) return;
        // army configuration entries of imported (allied) catalogues do not apply to this army
        if (imported && d.categoryLinks.some((c: any) => c.primary && configCats.has(c.targetId))) return;
        seenTarget.add(d.targetId);
        roots.push(d);
      };
      for (const e of arr(doc.selectionEntries)) push(this.def(e, 'entry'));
      for (const l of arr(doc.entryLinks)) push(this.def(l, l.type === 'selectionEntryGroup' ? 'group' : 'entry'));
      for (const cl of arr(doc.catalogueLinks)) {
        if (cl.importRootEntries) addRoots(data.catalogues.find((c) => c.id === cl.targetId), true);
      }
    };
    addRoots(this.primaryCatalogue);
    addRoots(data.gameSystem);
    const fe = this.forceEntry;
    this.forceDef = {
      id: fe.id, targetId: fe.id, kind: 'entry', node: fe, name: fe.name, type: 'force',
      constraints: [
        ...arr(fe.constraints),
        // category link constraints are counted against selections with that category
        ...arr(fe.categoryLinks).flatMap((cl: any) => arr(cl.constraints).map((c: any) => ({ ...c, childId: cl.targetId, _category: true }))),
      ],
      modifiers: [...arr(fe.modifiers), ...arr(fe.categoryLinks).flatMap((cl: any) => arr(cl.modifiers))],
      modifierGroups: arr(fe.modifierGroups),
      categoryLinks: [], costs: [], profiles: [], rules: [], infoLinks: [], infoGroups: [], associations: [],
      hidden: false, collective: false, sortIndex: 0,
      _children: roots.filter(Boolean).sort(sortDefs),
    };
  }

  private index(o: any) {
    if (Array.isArray(o)) return o.forEach((x) => this.index(x));
    if (!o || typeof o !== 'object') return;
    if (o.id && !this.byId.has(o.id) && !('field' in o)) this.byId.set(o.id, o);
    for (const k in o) {
      const v = o[k];
      if (v && typeof v === 'object') this.index(v);
    }
  }

  /** Build (memoised) definition for an entry, group or entry link. */
  def(n: BsNode, kind: 'entry' | 'group'): Def {
    const existing = this.defs.get(n.id);
    if (existing) return existing;
    const isLink = !!n.targetId && (n.type === 'selectionEntry' || n.type === 'selectionEntryGroup');
    const t = isLink ? this.byId.get(n.targetId) : n;
    if (!t) return undefined as unknown as Def;
    const link = isLink ? n : undefined;
    const merged = (k: string) => [...arr(t[k]), ...arr(link?.[k])];
    let costs = arr(t.costs);
    if (link && arr(link.costs).length) {
      const m = new Map(costs.map((c: any) => [c.typeId, c]));
      for (const c of link.costs) m.set(c.typeId, c);
      costs = [...m.values()];
    }
    const d: Def = {
      id: n.id,
      targetId: t.id,
      kind,
      node: t,
      link,
      name: t.name,
      type: kind === 'entry' ? t.type : undefined,
      constraints: merged('constraints'),
      modifiers: merged('modifiers'),
      modifierGroups: merged('modifierGroups'),
      categoryLinks: merged('categoryLinks'),
      costs,
      profiles: arr(t.profiles),
      rules: arr(t.rules),
      infoLinks: merged('infoLinks'),
      infoGroups: arr(t.infoGroups),
      associations: arr(t.associations),
      hidden: !!(t.hidden || link?.hidden),
      collective: !!(t.collective || link?.collective),
      defaultId: t.defaultSelectionEntryId,
      sortIndex: link?.sortIndex ?? t.sortIndex ?? 0,
    };
    this.defs.set(n.id, d);
    return d;
  }

  children(d: Def): Def[] {
    if (d._children) return d._children;
    const t = d.node;
    const out: Def[] = [];
    for (const e of arr(t.selectionEntries)) out.push(this.def(e, 'entry'));
    for (const g of arr(t.selectionEntryGroups)) out.push(this.def(g, 'group'));
    for (const l of arr(t.entryLinks)) {
      const c = this.def(l, l.type === 'selectionEntryGroup' ? 'group' : 'entry');
      if (c) out.push(c);
    }
    d._children = out.filter(Boolean).sort(sortDefs);
    return d._children;
  }

  getDef(id: string): Def | undefined {
    const d = this.defs.get(id);
    if (d) return d;
    // walk everything once to register nested definitions
    const walk = (x: Def, seen: Set<string>) => {
      if (seen.has(x.id)) return;
      seen.add(x.id);
      for (const c of this.children(x)) walk(c, seen);
    };
    walk(this.forceDef, new Set());
    return this.defs.get(id);
  }

  categoryName(id: string) {
    return this.categories.get(id) ?? id;
  }

  /** Resolve info links (profiles / rules / info groups) of a definition. */
  infoTargets(d: Def) {
    const profiles: BsNode[] = [...d.profiles];
    const rules: BsNode[] = [...d.rules];
    const visitGroup = (g: BsNode) => {
      profiles.push(...arr(g.profiles));
      rules.push(...arr(g.rules));
      for (const l of arr(g.infoLinks)) visitLink(l);
      for (const sg of arr(g.infoGroups)) visitGroup(sg);
    };
    const visitLink = (l: BsNode) => {
      const t = this.byId.get(l.targetId);
      if (!t) return;
      if (l.type === 'profile') profiles.push(l.hidden ? { ...t, hidden: true } : t);
      else if (l.type === 'rule') rules.push(t);
      else if (l.type === 'infoGroup') visitGroup(t);
    };
    for (const l of d.infoLinks) visitLink(l);
    for (const g of d.infoGroups) visitGroup(g);
    return { profiles, rules };
  }
}

export function sortDefs(a: Def, b: Def) {
  return (a.sortIndex || 0) - (b.sortIndex || 0) || a.name.localeCompare(b.name);
}
