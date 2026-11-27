/* eslint-disable @typescript-eslint/no-explicit-any */
import type { BsNode, Message, Roster, Sel } from './types';
import { Catalog, type Def } from './catalog';

const arr = (x: any): any[] => (Array.isArray(x) ? x : []);
const TYPE_IDS = new Set(['unit', 'model', 'upgrade']);

export class RNode {
  kind: 'roster' | 'force' | 'sel';
  sel?: Sel;
  def: Def;
  parent?: RNode;
  children: RNode[] = [];
  /** depth-first order, used by "before" conditions */
  order = 0;
  virtual = false;
  constructor(kind: RNode['kind'], def: Def, parent?: RNode, sel?: Sel) {
    this.kind = kind;
    this.def = def;
    this.parent = parent;
    this.sel = sel;
  }
  get n() {
    return this.sel?.n ?? 1;
  }
  get uid() {
    return this.sel?.uid ?? this.kind;
  }
}

interface Evaluated {
  defaultAmount?: number;
  name: string;
  hidden: boolean;
  costs: Map<string, number>;
  cons: Map<string, number>;
  msgs: { level: Message['level']; text: string }[];
}

interface Cats {
  set: Set<string>;
  primary?: string;
}

export interface Option {
  def: Def;
  name: string;
  hidden: boolean;
  /** points cost of one selection of this option (own cost only) */
  cost: number;
  /** detachment points cost */
  dp: number;
  /** suggested starting number (e.g. the points limit of the chosen battle size) */
  defaultAmount?: number;
  min: number;
  /** -1 = unlimited */
  max: number;
  count: number;
  nodes: RNode[];
  /** group options */
  children?: Option[];
  /** group path used when selecting through this option */
  gs: string[];
}

export interface Constraint {
  id: string;
  type: 'min' | 'max';
  value: number;
  field: string;
  scope: string;
  includeChildSelections?: boolean;
  childId?: string;
  message?: string;
  _category?: boolean;
}

export class State {
  cat: Catalog;
  roster: Roster;
  root: RNode;
  force: RNode;
  byUid = new Map<string, RNode>();
  private evMemo = new Map<RNode, Evaluated>();
  private evBusy = new Set<RNode>();
  private catMemo = new Map<RNode, Cats>();
  private catBusy = new Set<RNode>();
  private costMemo = new Map<string, number>();
  private incoming = new Map<string, { from: RNode; assocId: string }[]>();
  private nodesInOrder: RNode[] = [];

  constructor(cat: Catalog, roster: Roster) {
    this.cat = cat;
    this.roster = roster;
    const rosterDef = { ...cat.forceDef, id: 'roster', targetId: 'roster', name: roster.name, constraints: [], modifiers: [], modifierGroups: [], _children: [] } as Def;
    this.root = new RNode('roster', rosterDef);
    this.force = new RNode('force', cat.forceDef, this.root);
    this.root.children.push(this.force);
    let order = 0;
    const build = (sels: Sel[], parent: RNode) => {
      for (const s of sels) {
        const def = cat.getDef(s.id);
        if (!def) continue; // unknown (data changed) - dropped
        const node = new RNode('sel', def, parent, s);
        node.order = order++;
        parent.children.push(node);
        this.byUid.set(s.uid, node);
        this.nodesInOrder.push(node);
        build(s.ch, node);
      }
    };
    build(roster.sels, this.force);
    for (const node of this.nodesInOrder) {
      for (const [assocId, targets] of Object.entries(node.sel?.assoc ?? {})) {
        for (const t of targets) {
          if (!this.incoming.has(t)) this.incoming.set(t, []);
          this.incoming.get(t)!.push({ from: node, assocId });
        }
      }
    }
  }

  // ------------------------------------------------------------------ helpers
  allNodes() {
    return this.nodesInOrder;
  }

  topLevel() {
    return this.force.children;
  }

  rootEntry(node: RNode): RNode | undefined {
    let n: RNode | undefined = node;
    while (n && n.parent && n.parent.kind !== 'force') n = n.parent;
    return n?.kind === 'sel' ? n : undefined;
  }

  /** a virtual (not yet selected) instance of an option under a parent */
  virtual(parent: RNode, def: Def, gs: string[] = []): RNode {
    const v = new RNode('sel', def, parent, { uid: `virtual:${def.id}`, id: def.id, n: 1, ch: [], gs });
    v.virtual = true;
    v.order = Number.MAX_SAFE_INTEGER;
    if (def.kind === 'group') v.children = parent.children.filter((c) => c.sel?.gs?.includes(def.id));
    return v;
  }

  // ------------------------------------------------------------------ categories
  cats(node: RNode): Cats {
    const memo = this.catMemo.get(node);
    if (memo) return memo;
    const base: Cats = { set: new Set(node.def.categoryLinks.map((c: any) => c.targetId)) };
    const primary = node.def.categoryLinks.find((c: any) => c.primary);
    if (primary) base.primary = primary.targetId;
    if (this.catBusy.has(node)) return base;
    this.catBusy.add(node);
    const apply = (m: BsNode) => {
      const v = String(m.value);
      if (m.type === 'add') base.set.add(v);
      else if (m.type === 'remove') {
        base.set.delete(v);
        if (base.primary === v) base.primary = undefined;
      } else if (m.type === 'set-primary') {
        base.set.add(v);
        base.primary = v;
      } else if (m.type === 'unset-primary') {
        if (base.primary === v) base.primary = undefined;
      }
    };
    this.walkMods(node.def, node, (m) => {
      if (m.field === 'category' && (!m.scope || m.scope === 'self')) apply(m);
    });
    // modifiers on descendants that target this node (e.g. an upgrade granting a keyword to its unit)
    if (node.kind === 'sel' && !node.virtual) {
      const visit = (d: RNode) => {
        for (const c of d.children) {
          this.walkMods(c.def, c, (m) => {
            if (m.field === 'category' && m.scope && m.scope !== 'self' && !m.affects && this.resolveScope(m.scope, c) === node) apply(m);
          });
          visit(c);
        }
      };
      visit(node);
    }
    this.catBusy.delete(node);
    this.catMemo.set(node, base);
    return base;
  }

  primaryCategory(node: RNode) {
    return this.cats(node).primary;
  }

  // ------------------------------------------------------------------ evaluation
  ev(node: RNode): Evaluated {
    const memo = this.evMemo.get(node);
    if (memo) return memo;
    const d = node.def;
    const res: Evaluated = {
      name: d.name,
      hidden: d.hidden,
      costs: new Map(d.costs.map((c: any) => [c.typeId, Number(c.value) || 0])),
      cons: new Map(d.constraints.map((c: any) => [c.id, Number(c.value)])),
      msgs: [],
      defaultAmount: Number.isFinite(Number(d.node.defaultAmount)) && d.node.defaultAmount !== '' && d.node.defaultAmount !== undefined ? Number(d.node.defaultAmount) : undefined,
    };
    if (this.evBusy.has(node)) return res;
    this.evBusy.add(node);
    this.walkMods(d, node, (m, times) => {
      if (m.scope && m.scope !== 'self') return;
      if (m.affects) return;
      const f = m.field;
      if (f === 'defaultAmount') res.defaultAmount = Number.isFinite(Number(m.value)) ? Number(m.value) : res.defaultAmount;
      else if (f === 'hidden') res.hidden = m.value === true || m.value === 'true';
      else if (f === 'name') {
        if (m.type === 'set') res.name = String(m.value);
        else if (m.type === 'append') res.name = `${res.name}${m.join ?? ' '}${m.value}`;
        else if (m.type === 'replace' && m.arg) res.name = res.name.replace(m.arg, String(m.value));
      } else if (f === 'error' || f === 'warning' || f === 'info') {
        if (m.type === 'add') res.msgs.push({ level: f, text: String(m.value) });
      } else if (res.costs.has(f) || this.cat.costTypes.some((c) => c.id === f)) {
        res.costs.set(f, numOp(m, res.costs.get(f) ?? 0, times));
      } else if (res.cons.has(f)) {
        res.cons.set(f, numOp(m, res.cons.get(f)!, times));
      }
    });
    this.evBusy.delete(node);
    this.evMemo.set(node, res);
    return res;
  }

  name(node: RNode) {
    return this.ev(node).name;
  }

  /** Iterate over the modifiers of a definition whose conditions pass. */
  walkMods(d: Def, ctx: RNode, fn: (m: BsNode, times: number) => void) {
    const visitMod = (m: BsNode) => {
      if (!this.condsPass(m, ctx)) return;
      let times = 1;
      if (arr(m.repeats).length) {
        times = 0;
        for (const r of m.repeats) {
          const scope = this.resolveScope(r.scope, ctx);
          const c = scope ? this.count(scope, r.childId, r.field, r.includeChildSelections, ctx) : 0;
          const per = Number(r.value) || 1;
          const k = r.roundUp ? Math.ceil(c / per) : Math.floor(c / per);
          times += k * (Number(r.repeats) || 1);
        }
        if (times <= 0) return;
      }
      fn(m, times);
    };
    const visitGroup = (g: BsNode) => {
      if (!this.condsPass(g, ctx)) return;
      arr(g.modifiers).forEach(visitMod);
      arr(g.modifierGroups).forEach(visitGroup);
    };
    d.modifiers.forEach(visitMod);
    d.modifierGroups.forEach(visitGroup);
  }

  condsPass(o: BsNode, ctx: RNode): boolean {
    for (const c of arr(o.conditions)) if (!this.cond(c, ctx)) return false;
    for (const g of arr(o.conditionGroups)) if (!this.condGroup(g, ctx)) return false;
    for (const l of arr(o.localConditionGroups)) if (!this.localGroup(l, ctx)) return false;
    return true;
  }

  condGroup(g: BsNode, ctx: RNode): boolean {
    const results: boolean[] = [];
    for (const c of arr(g.conditions)) results.push(this.cond(c, ctx));
    for (const sg of arr(g.conditionGroups)) results.push(this.condGroup(sg, ctx));
    for (const l of arr(g.localConditionGroups)) results.push(this.localGroup(l, ctx));
    if (!results.length) return true;
    return g.type === 'or' ? results.some(Boolean) : results.every(Boolean);
  }

  /** Count the selections in scope that satisfy every inner condition (evaluated from each candidate). */
  localGroup(l: BsNode, ctx: RNode): boolean {
    const scope = this.resolveScope(l.scope, ctx);
    let c = 0;
    if (scope) {
      const candidates = l.includeChildSelections ? descendants(scope) : scope.children;
      for (const cand of candidates) {
        let ok = true;
        for (const inner of arr(l.conditions)) {
          if (inner.type === 'before') {
            if (!(cand.order < ctx.order && (inner.childId === 'any' || this.matches(cand, inner.childId)))) ok = false;
          } else if (!this.cond(inner, cand)) ok = false;
          if (!ok) break;
        }
        if (ok) c += cand.n;
      }
    }
    return compare(l.type, c, Number(l.value));
  }

  cond(c: BsNode, ctx: RNode): boolean {
    const t = c.type;
    if (t === 'instanceOf' || t === 'notInstanceOf') {
      let r: boolean;
      if (c.scope === 'ancestor') {
        r = false;
        for (let p = ctx.parent; p; p = p.parent) if (this.matches(p, c.childId)) { r = true; break; }
      } else if (c.scope === 'primary-catalogue') {
        r = this.cat.primaryCatalogueId === c.childId;
      } else {
        const s = this.resolveScope(c.scope, ctx);
        r = !!s && this.matches(s, c.childId);
      }
      return t === 'instanceOf' ? r : !r;
    }
    if (t === 'before') return true;
    const scope = this.resolveScope(c.scope, ctx);
    const v = scope ? this.count(scope, c.childId, c.field, c.includeChildSelections, ctx) : 0;
    return compare(t, v, Number(c.value));
  }

  resolveScope(scope: string, ctx: RNode): RNode | undefined {
    switch (scope) {
      case 'self':
      case undefined:
      case '':
        return ctx;
      case 'parent':
        return ctx.parent;
      case 'force':
      case 'primary-catalogue':
        return this.force;
      case 'roster':
        return this.root;
      case 'ancestor':
        return ctx.parent;
      case 'root-entry':
      case 'unit-self':
        return this.rootEntry(ctx) ?? ctx;
      case 'model-or-unit':
        return this.nearest(ctx, (n) => n.def.type === 'model' || n.def.type === 'unit');
      case 'unit':
      case 'model':
      case 'upgrade':
        return this.nearest(ctx, (n) => n.def.type === scope);
      default:
        if (scope === this.cat.forceEntry.id) return this.force;
        return this.nearest(ctx, (n) => this.matches(n, scope));
    }
  }

  private nearest(ctx: RNode, pred: (n: RNode) => boolean) {
    for (let n: RNode | undefined = ctx; n && n.kind === 'sel'; n = n.parent) if (pred(n)) return n;
    return undefined;
  }

  matches(node: RNode, id: string): boolean {
    if (!id) return false;
    if (id === 'any') return true;
    if (node.kind === 'force') return id === this.cat.forceEntry.id || id === this.cat.primaryCatalogueId;
    if (node.kind === 'roster') return false;
    if (TYPE_IDS.has(id)) return node.def.type === id;
    if (id === 'model-or-unit') return node.def.type === 'model' || node.def.type === 'unit';
    const d = node.def;
    if (d.id === id || d.targetId === id) return true;
    if (node.sel?.gs?.includes(id)) return true;
    return this.cats(node).set.has(id);
  }

  /** count selections / costs / forces / associations within a scope */
  count(scope: RNode, childId: string, field: string, deep: boolean | undefined, ctx: RNode): number {
    if (field === 'selections') {
      let c = 0;
      const visit = (n: RNode, mult: number) => {
        for (const ch of n.children) {
          if (ch.kind !== 'sel') {
            visit(ch, mult);
            continue;
          }
          if (this.matches(ch, childId)) c += ch.n * mult;
          if (deep) visit(ch, mult * ch.n);
        }
      };
      // force / roster scopes look through the force's top level always
      if (scope.kind === 'roster') visit(this.force, 1);
      else visit(scope, 1);
      return c;
    }
    if (field === 'forces') {
      return scope.kind === 'roster' || scope.kind === 'force' ? (this.matches(this.force, childId) ? 1 : 0) : 0;
    }
    if (field === 'associations') {
      const node = scope;
      let c = 0;
      for (const inc of this.incoming.get(node.uid) ?? []) if (this.matches(inc.from, childId) || childId === 'any') c++;
      for (const targets of Object.values(node.sel?.assoc ?? {})) {
        for (const t of targets) {
          const tn = this.byUid.get(t);
          if (tn && (childId === 'any' || this.matches(tn, childId))) c++;
        }
      }
      return c;
    }
    // cost type
    if (this.cat.costTypes.some((t) => t.id === field)) {
      const roots: RNode[] = [scope];
      if (ctx && scope.kind === 'sel') {
        // attached units count as one unit for "traverseAssociationGroup"
        for (const inc of this.incoming.get(scope.uid) ?? []) roots.push(inc.from);
        for (const targets of Object.values(scope.sel?.assoc ?? {})) for (const t of targets) { const tn = this.byUid.get(t); if (tn) roots.push(tn); }
      }
      let total = 0;
      for (const r of roots) total += r.kind === 'sel' ? this.totalCost(r, field) : this.sumChildren(r, field);
      return total;
    }
    return 0;
  }

  private sumChildren(n: RNode, typeId: string): number {
    if (n.kind === 'roster') return this.sumChildren(this.force, typeId);
    let t = 0;
    for (const c of n.children) t += this.totalCost(c, typeId);
    return t;
  }

  /** total cost of a selection including its children */
  totalCost(node: RNode, typeId: string = this.cat.ptsId): number {
    if (node.kind !== 'sel') return this.sumChildren(node, typeId);
    const key = `${node.uid}|${typeId}`;
    const m = this.costMemo.get(key);
    if (m !== undefined) return m;
    this.costMemo.set(key, 0);
    let own = this.ev(node).costs.get(typeId) ?? 0;
    for (const c of node.children) own += this.totalCost(c, typeId);
    const total = own * node.n;
    this.costMemo.set(key, total);
    return total;
  }

  points(node?: RNode) {
    return this.totalCost(node ?? this.force, this.cat.ptsId);
  }

  /** points of a unit including attached leaders/supports */
  pointsWithAttached(node: RNode) {
    let p = this.points(node);
    for (const inc of this.incoming.get(node.uid) ?? []) p += this.points(inc.from);
    return p;
  }

  // ------------------------------------------------------------------ constraints & options
  constraints(def: Def, ctx: RNode): Constraint[] {
    const ev = this.ev(ctx);
    return def.constraints.map((c: any) => ({ ...c, value: ev.cons.get(c.id) ?? Number(c.value) }));
  }

  /** current count relevant to a constraint of `def` evaluated under `parent` */
  constraintCount(c: Constraint, def: Def, parent: RNode, ctx: RNode): number {
    const scope = c.scope === 'parent' ? parent : this.resolveScope(c.scope, ctx);
    if (!scope) return 0;
    if (c.field === 'selections') {
      const id = c._category ? c.childId! : def.id;
      const matchDef = (n: RNode) => (c._category ? this.matches(n, id) : n.def.id === def.id || n.def.targetId === def.targetId || !!n.sel?.gs?.includes(def.id));
      let cnt = 0;
      const visit = (n: RNode, mult: number) => {
        for (const ch of n.children) {
          if (ch.kind !== 'sel') { visit(ch, mult); continue; }
          if (matchDef(ch)) cnt += ch.n * mult;
          if (c.includeChildSelections) visit(ch, mult * ch.n);
        }
      };
      visit(scope.kind === 'roster' ? this.force : scope, 1);
      return cnt;
    }
    return this.count(scope, c.childId ?? 'any', c.field, c.includeChildSelections, ctx);
  }

  /** The selectable options under a node (entries and groups), with evaluated state. */
  options(parent: RNode, defs?: Def[], gs: string[] = []): Option[] {
    const list = defs ?? this.cat.children(parent.def);
    const out: Option[] = [];
    for (const def of list) {
      if (def.kind === 'group') {
        const v = this.virtual(parent, def, gs);
        const ev = this.ev(v);
        const { min, max } = this.minMax(def, v);
        const childGs = [...gs, def.id];
        const children = this.options(parent, this.cat.children(def), childGs);
        const nodes = parent.children.filter((c) => c.sel?.gs?.includes(def.id));
        if (ev.hidden) hideAll(children);
        out.push({
          def, name: ev.name, hidden: ev.hidden || children.every((c) => c.hidden), cost: 0, dp: 0, min, max,
          count: nodes.reduce((a, n) => a + n.n, 0), nodes, children, gs: childGs,
        });
      } else {
        const nodes = parent.children.filter((c) => c.def.id === def.id);
        const ctx = nodes[0] ?? this.virtual(parent, def, gs);
        const ev = this.ev(nodes[0] ? this.virtualLike(nodes[0]) : ctx);
        const { min, max } = this.minMax(def, ctx);
        out.push({
          def, name: ev.name, hidden: ev.hidden, cost: ev.costs.get(this.cat.ptsId) ?? 0, dp: ev.costs.get(this.cat.dpId) ?? 0, defaultAmount: ev.defaultAmount, min, max,
          count: nodes.reduce((a, n) => a + n.n, 0), nodes, gs,
        });
      }
    }
    return out;
  }

  /** evaluation of an existing node (wrapper kept for symmetry) */
  private virtualLike(n: RNode) {
    return n;
  }

  minMax(def: Def, ctx: RNode) {
    let min = 0;
    let max = -1;
    for (const c of this.constraints(def, ctx)) {
      if (c.field !== 'selections' || c.scope !== 'parent') continue;
      if (c.type === 'min') min = Math.max(min, c.value);
      if (c.type === 'max' && c.value >= 0) max = max < 0 ? c.value : Math.min(max, c.value);
    }
    return { min, max };
  }

  /** root level entries available to add to the force */
  rootOptions(): Option[] {
    return this.options(this.force);
  }

  // ------------------------------------------------------------------ associations (leaders)
  associations(node: RNode) {
    return node.def.associations.map((a: BsNode) => {
      const targets = (node.sel?.assoc?.[a.id] ?? []).map((u) => this.byUid.get(u)).filter(Boolean) as RNode[];
      const scope = this.resolveScope(a.scope ?? 'force', node) ?? this.force;
      const candidates = (scope.kind === 'sel' ? scope.children : this.topLevel()).filter(
        (c) => c !== node && this.condsPass(a, c) && (a.childId === 'unit' ? c.def.type === 'unit' || c.def.type === 'model' : this.matches(c, a.childId)),
      );
      return { assoc: a, label: a.label ?? a.name, min: Number(a.min ?? 0), max: Number(a.max ?? 1), targets, candidates };
    });
  }

  /** units attached to this unit (incoming associations) */
  attachedTo(node: RNode) {
    return (this.incoming.get(node.uid) ?? []).map((i) => i.from);
  }

  // ------------------------------------------------------------------ profiles
  /** profiles (stats, weapons, abilities) of a unit with modifiers from its selections applied */
  profiles(node: RNode) {
    type P = { id: string; name: string; typeName: string; typeId: string; chars: { name: string; typeId: string; value: string }[]; count: number };
    const out = new Map<string, P>();
    const mods: { m: BsNode; times: number }[] = [];
    const visit = (n: RNode, mult: number) => {
      const { profiles } = this.cat.infoTargets(n.def);
      for (const p of profiles) {
        if (p.hidden) continue;
        if (!this.profileVisible(p, n)) continue;
        const key = p.id;
        const ex = out.get(key);
        if (ex) ex.count += n.n * mult;
        else
          out.set(key, {
            id: p.id, name: p.name, typeName: p.typeName, typeId: p.typeId, count: n.n * mult,
            chars: arr(p.characteristics).map((c: any) => ({ name: c.name, typeId: c.typeId, value: c.$text ?? '' })),
          });
      }
      this.walkMods(n.def, n, (m, times) => {
        if (m.affects && String(m.affects).includes('profiles')) mods.push({ m, times });
      });
      for (const c of n.children) visit(c, mult * c.n);
    };
    visit(node, 1);
    for (const { m, times } of mods) {
      const aff = String(m.affects);
      const typeName = aff.split('profiles.')[1];
      for (const p of out.values()) {
        if (typeName && p.typeName !== typeName) continue;
        for (const c of p.chars) {
          if (c.typeId !== m.field && c.name !== m.field) continue;
          c.value = charOp(m, c.value, times);
        }
      }
    }
    return [...out.values()];
  }

  private profileVisible(p: BsNode, ctx: RNode) {
    let hidden = !!p.hidden;
    if (arr(p.modifiers).length || arr(p.modifierGroups).length) {
      this.walkMods({ modifiers: arr(p.modifiers), modifierGroups: arr(p.modifierGroups) } as Def, ctx, (m) => {
        if (m.field === 'hidden') hidden = m.value === true || m.value === 'true';
      });
    }
    return !hidden;
  }

  rules(node: RNode) {
    const out = new Map<string, BsNode>();
    const visit = (n: RNode) => {
      for (const r of this.cat.infoTargets(n.def).rules) if (!this.profileVisible(r, n)) continue; else out.set(r.id, r);
      n.children.forEach(visit);
    };
    visit(node);
    return [...out.values()];
  }

  // ------------------------------------------------------------------ validation
  validate(): Message[] {
    const msgs: Message[] = [];
    const seen = new Set<string>();
    const check = (parent: RNode, defs: Def[], gs: string[]) => {
      for (const def of defs) {
        const existing = def.kind === 'group' ? undefined : parent.children.find((c) => c.def.id === def.id);
        const ctx = existing ?? this.virtual(parent, def, gs);
        const ev = this.ev(ctx);
        if (ev.hidden && !existing) continue;
        for (const c of this.constraints(def, ctx)) {
          if (c.value < 0) continue;
          const scopeNode = c.scope === 'parent' ? parent : this.resolveScope(c.scope, ctx);
          if (!scopeNode) continue;
          const key = `${c.id}|${scopeNode.uid}|${scopeNode === parent ? parent.uid : ''}`;
          if (seen.has(key)) continue;
          seen.add(key);
          const n = this.constraintCount(c, def, parent, ctx);
          const pn = parent.kind === 'sel' ? this.name(parent) : '';
          const label = pn && pn !== ev.name ? `${pn}: ${ev.name}` : ev.name;
          if (c.type === 'max' && n > c.value) {
            msgs.push({ level: 'error', uid: existing?.uid ?? parent.sel?.uid, text: c.message ? c.message.replace('{value}', String(c.value)) : maxText(label, c, n, this.cat) });
          }
          if (c.type === 'min' && n < c.value) {
            if (c.field !== 'selections' && c.value === 0) continue;
            msgs.push({ level: 'error', uid: parent.sel?.uid, text: c.message ? c.message.replace('{value}', String(c.value)) : minText(label, c, n, this.cat) });
          }
        }
        if (def.kind === 'group') check(parent, this.cat.children(def), [...gs, def.id]);
      }
    };
    // force level constraints (points limit, detachment points, enhancement count, required categories)
    const fev = this.ev(this.force);
    for (const c of this.constraints(this.cat.forceDef, this.force)) {
      if (c.value < 0) continue;
      if (c.field === this.cat.ptsId && c.value === 0) continue;
      const scope = c.scope === 'parent' ? this.root : this.resolveScope(c.scope, this.force) ?? this.root;
      const n = c._category
        ? this.count(scope, c.childId!, 'selections', true, this.force)
        : this.count(scope, c.childId ?? 'any', c.field, true, this.force);
      if (c.type === 'max' && n > c.value) msgs.push({ level: 'error', text: c.message ? c.message.replace('{value}', String(c.value)) : maxText(c._category ? this.cat.categoryName(c.childId!) : 'Army', c, n, this.cat) });
      if (c.type === 'min' && n < c.value) msgs.push({ level: 'error', text: c.message ? c.message.replace('{value}', String(c.value)) : minText(c._category ? this.cat.categoryName(c.childId!) : 'Army', c, n, this.cat) });
    }
    fev.msgs.forEach((m) => msgs.push({ ...m }));
    check(this.force, this.cat.children(this.cat.forceDef), []);
    for (const node of this.nodesInOrder) {
      check(node, this.cat.children(node.def), []);
      const ev = this.ev(node);
      for (const m of ev.msgs) msgs.push({ level: m.level, text: `${this.name(this.rootEntry(node) ?? node)}: ${m.text}`, uid: (this.rootEntry(node) ?? node).uid });
      if (ev.hidden && node.def.type !== 'upgrade') msgs.push({ level: 'warning', uid: node.uid, text: `${ev.name} is not available with the current army options` });
      for (const a of this.associations(node)) {
        if (a.targets.length > a.max) msgs.push({ level: 'error', uid: node.uid, text: `${ev.name}: can only be attached to ${a.max} unit(s)` });
        for (const t of a.targets) {
          if (!a.candidates.includes(t)) msgs.push({ level: 'error', uid: node.uid, text: `${ev.name} cannot be attached to ${this.name(t)}` });
        }
      }
    }
    // dedupe
    const uniq = new Map<string, Message>();
    for (const m of msgs) uniq.set(`${m.level}|${m.text}`, m);
    return [...uniq.values()];
  }

  // ------------------------------------------------------------------ army summary
  limits() {
    const ev = this.ev(this.force);
    const find = (field: string) => this.cat.forceDef.constraints.find((c: any) => c.field === field && c.type === 'max' && !c._category);
    const pts = find(this.cat.ptsId);
    const dp = find(this.cat.dpId);
    const enh = find(this.cat.enhId);
    return {
      pointsLimit: pts ? ev.cons.get(pts.id) ?? 0 : 0,
      dpLimit: dp ? ev.cons.get(dp.id) ?? 0 : 0,
      enhLimit: enh ? ev.cons.get(enh.id) ?? 0 : 0,
      points: this.points(),
      dp: this.totalCost(this.force, this.cat.dpId),
      enh: this.totalCost(this.force, this.cat.enhId),
    };
  }
}

function hideAll(opts: Option[]) {
  for (const o of opts) {
    o.hidden = true;
    if (o.children) hideAll(o.children);
  }
}

function descendants(n: RNode): RNode[] {
  const out: RNode[] = [];
  const visit = (x: RNode) => x.children.forEach((c) => { out.push(c); visit(c); });
  visit(n.kind === 'roster' ? n.children[0] : n);
  return out;
}

function compare(type: string, v: number, value: number) {
  switch (type) {
    case 'atLeast': return v >= value;
    case 'atMost': return v <= value;
    case 'greaterThan': return v > value;
    case 'lessThan': return v < value;
    case 'equalTo': return v === value;
    case 'notEqualTo': return v !== value;
    default: return false;
  }
}

function numOp(m: BsNode, cur: number, times: number) {
  const v = Number(m.value);
  if (Number.isNaN(v)) return cur;
  switch (m.type) {
    case 'set': return v;
    case 'increment': return cur + v * times;
    case 'decrement': return cur - v * times;
    case 'multiply': return cur * Math.pow(v, times);
    case 'divide': return v ? cur / Math.pow(v, times) : cur;
    default: return cur;
  }
}

function charOp(m: BsNode, cur: string, times: number) {
  if (m.type === 'set') return String(m.value);
  if (m.type === 'append') return cur ? `${cur}${m.join ?? ', '}${m.value}` : String(m.value);
  if (m.type === 'replace' && m.arg) return cur.replace(m.arg, String(m.value));
  const match = /^(-?\d+)(.*)$/.exec(cur.trim());
  if (!match) return cur;
  const n = numOp(m, Number(match[1]), times);
  return `${n}${match[2]}`;
}

function fieldLabel(c: Constraint, cat: Catalog) {
  if (c.field === 'selections') return '';
  const t = cat.costTypes.find((x) => x.id === c.field);
  return t ? ` ${t.name}` : '';
}

function maxText(label: string, c: Constraint, n: number, cat: Catalog) {
  if (c.field === cat.ptsId) return `Army is over the points limit (${n}/${c.value} pts)`;
  if (c.field === cat.dpId) return `Too many Detachment Points spent (${n}/${c.value} DP)`;
  if (c.field === cat.enhId) return `Too many Enhancements (${n}/${c.value})`;
  if (c.value === 0) return `${label} is not allowed`;
  const where = c.scope === 'roster' || c.scope === 'force' ? ' per army' : '';
  return `${label}: maximum ${c.value}${fieldLabel(c, cat)}${where} (has ${n})`;
}

function minText(label: string, c: Constraint, n: number, cat: Catalog) {
  if (c.value === 1 && c.field === 'selections') return `${label}: must be selected`;
  return `${label}: minimum ${c.value}${fieldLabel(c, cat)} (has ${n})`;
}
