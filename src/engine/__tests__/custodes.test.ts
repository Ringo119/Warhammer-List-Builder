import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { Catalog } from '../catalog';
import { State, type Option } from '../state';
import { newRoster, addSelection, chooseInGroup, setAssociation, removeSelection } from '../ops';
import type { Roster } from '../types';

const data = JSON.parse(fs.readFileSync('public/data/adeptus-custodes.json', 'utf8'));
const cat = new Catalog(data);

const flat = (opts: Option[]): Option[] => opts.flatMap((o) => (o.children ? [o, ...flat(o.children)] : [o]));
const top = (st: State, name: string) => st.topLevel().find((n) => st.name(n) === name)!;

function setup(detachment = 'Aquilan Shield', size = '2. Strike Force') {
  let r: Roster = newRoster(cat, 'Test', 'adeptus-custodes');
  let st = new State(cat, r);
  const bs = top(st, 'Battle Size');
  const g = st.options(bs).find((o) => o.def.kind === 'group')!;
  r = chooseInGroup(cat, r, bs.uid, g, g.children!.find((c) => c.name.startsWith(size))!);
  st = new State(cat, r);
  const det = top(st, 'Detachment');
  const opt = flat(st.options(det)).find((o) => o.name === detachment)!;
  r = addSelection(cat, r, det.uid, opt.def, opt.gs).roster;
  return r;
}

function add(r: Roster, name: string) {
  const st = new State(cat, r);
  const o = st.rootOptions().find((x) => x.name === name);
  if (!o) throw new Error(`no root option ${name}`);
  return addSelection(cat, r, null, o.def);
}

describe('Adeptus Custodes roster', () => {
  it('creates the army configuration automatically', () => {
    const st = new State(cat, newRoster(cat, 'T', 'adeptus-custodes'));
    expect(st.topLevel().map((n) => st.name(n))).toEqual(['Battle Size', 'Detachment', 'Force Disposition', "Martial Ka'tah Reference"]);
  });

  it('applies battle size limits', () => {
    const st = new State(cat, setup());
    expect(st.limits()).toMatchObject({ pointsLimit: 2000, dpLimit: 3, enhLimit: 4, dp: 1 });
    const inc = new State(cat, setup('Aquilan Shield', '1. Incursion'));
    expect(inc.limits()).toMatchObject({ pointsLimit: 1000, dpLimit: 2, enhLimit: 2 });
  });

  it('prices units including wargear and escalating duplicates', () => {
    let r = setup();
    r = add(r, 'Shield-Captain').roster;
    r = add(r, 'Shield-Captain').roster;
    for (let i = 0; i < 4; i++) r = add(r, 'Custodian Guard Sodality').roster;
    const st = new State(cat, r);
    const caps = st.topLevel().filter((n) => st.name(n) === 'Shield-Captain');
    expect(caps.map((n) => st.points(n))).toEqual([205, 225]);
    const cgs = st.topLevel().filter((n) => st.name(n) === 'Custodian Guard Sodality');
    expect(cgs.map((n) => st.points(n))).toEqual([240, 240, 240, 270]);
    expect(st.limits().points).toBe(205 + 225 + 240 * 3 + 270);
  });

  it('only offers enhancements from selected detachments to characters', () => {
    let r = setup('Aquilan Shield');
    r = add(r, 'Shield-Captain').roster;
    r = add(r, 'Custodian Guard Sodality').roster;
    const st = new State(cat, r);
    const enh = flat(st.options(top(st, 'Shield-Captain'))).filter((o) => !o.hidden && o.cost > 0 && !o.children);
    expect(enh.map((o) => o.name).sort()).toEqual(['Not a Shell Wasted', "Pareldor's Caducatrix", 'Paragon Blade & Praesidium Shield', 'Pyrithite Spear & Praesidium shield'].sort());
    const cgEnh = flat(st.options(top(st, 'Custodian Guard Sodality'))).filter((o) => !o.hidden && /Shell|Pareldor/.test(o.name));
    expect(cgEnh).toHaveLength(0);
  });

  it('unlocks force dispositions from the detachment', () => {
    const st = new State(cat, setup('Aquilan Shield'));
    const fd = flat(st.options(top(st, 'Force Disposition'))).filter((o) => !o.hidden && !o.children);
    expect(fd.length).toBeGreaterThan(0);
  });

  it('attaches leaders to eligible bodyguards and validates', () => {
    let r = setup();
    const sc = add(r, 'Shield-Captain');
    r = sc.roster;
    const cg = add(r, 'Custodian Guard Sodality');
    r = cg.roster;
    r = add(r, 'Allarus Custodians').roster;
    let st = new State(cat, r);
    const a = st.associations(st.byUid.get(sc.uid)!)[0];
    expect(a.candidates.map((c) => st.name(c))).toEqual(['Custodian Guard Sodality']);
    r = setAssociation(r, sc.uid, a.assoc.id, [cg.uid]);
    st = new State(cat, r);
    expect(st.attachedTo(st.byUid.get(cg.uid)!).map((n) => n.uid)).toEqual([sc.uid]);
    r = removeSelection(r, cg.uid);
    st = new State(cat, r);
    expect(st.byUid.get(sc.uid)!.sel!.assoc![a.assoc.id]).toEqual([]);
  });

  it('flags missing warlord-capable character and over-limit units', () => {
    let r = setup();
    for (let i = 0; i < 4; i++) r = add(r, 'Allarus Custodians').roster;
    const st = new State(cat, r);
    const msgs = st.validate().map((m) => m.text);
    expect(msgs.some((m) => /Character/.test(m))).toBe(true);
    expect(msgs.some((m) => /Allarus Custodians: maximum 3/.test(m))).toBe(true);
  });
});

describe('model counts', () => {
  it('reprices units by model count', async () => {
    const { setCount } = await import('../ops');
    let r = setup();
    const res = add(r, 'Allarus Custodians');
    r = res.roster;
    let st = new State(cat, r);
    const unit = st.byUid.get(res.uid)!;
    expect(st.points(unit)).toBe(180);
    const model = unit.children.find((c) => c.def.type === 'model')!;
    r = setCount(r, model.uid, 3);
    st = new State(cat, r);
    expect(st.points(st.byUid.get(res.uid)!)).toBe(270);
  });

  it('round-trips share codes', async () => {
    const { toShareCode, fromShareCode } = await import('../../export');
    let r = setup();
    const sc = add(r, 'Shield-Captain');
    r = sc.roster;
    const cg = add(r, 'Custodian Guard Sodality');
    r = cg.roster;
    const st0 = new State(cat, r);
    const a = st0.associations(st0.byUid.get(sc.uid)!)[0];
    r = setAssociation(r, sc.uid, a.assoc.id, [cg.uid]);
    const back = await fromShareCode(await toShareCode(r));
    const st = new State(cat, back);
    expect(st.limits().points).toBe(new State(cat, r).limits().points);
    const cap = st.topLevel().find((n) => st.name(n) === 'Shield-Captain')!;
    const guard = st.topLevel().find((n) => st.name(n) === 'Custodian Guard Sodality')!;
    expect(st.attachedTo(guard)).toEqual([cap]);
  });
});

describe('defaults', () => {
  it('starts every datasheet at its minimum size with default wargear', () => {
    const base = setup();
    const st0 = new State(cat, base);
    const units = st0.rootOptions().filter((o) => !o.hidden && o.def.kind === 'entry' && ['unit', 'model'].includes(o.def.type!));
    expect(units.length).toBeGreaterThan(20);
    const problems: string[] = [];
    for (const o of units) {
      const res = addSelection(cat, base, null, o.def);
      const st = new State(cat, res.roster);
      const node = st.byUid.get(res.uid)!;
      const inUnit = (u?: string) => { for (let n = u ? st.byUid.get(u) : undefined; n; n = n.parent) if (n === node) return true; return false; };
      for (const m of st.validate()) if (m.level === 'error' && inUnit(m.uid) && /minimum|must be selected/.test(m.text)) problems.push(m.text);
    }
    expect(problems).toEqual([]);
  });

  it('Witchseekers start at 4 models and Blade Champion with Vaultswords', () => {
    let r = setup();
    const ws = add(r, 'Witchseeker Squad');
    const bc = add(ws.roster, 'Blade Champion');
    const st = new State(cat, bc.roster);
    const w = st.byUid.get(ws.uid)!;
    expect(w.children.filter((c) => c.def.type === 'model').reduce((t, c) => t + c.n, 0)).toBe(4);
    expect(st.byUid.get(bc.uid)!.children.map((c) => st.name(c))).toContain('Vaultswords');
  });

  it('points override starts at the battle size limit', () => {
    const r = setup();
    let st = new State(cat, r);
    const bs = top(st, 'Battle Size');
    const ov = st.options(bs).find((o) => o.name === 'Override points limit?')!;
    const res = addSelection(cat, r, bs.uid, ov.def);
    st = new State(cat, res.roster);
    const pl = st.byUid.get(res.uid)!.children[0];
    expect(pl.n).toBe(2000);
    expect(st.limits().pointsLimit).toBe(2000);
  });
});
