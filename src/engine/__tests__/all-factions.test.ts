import { describe, it, expect } from 'vitest';
import { factionKeys, loadFaction } from './load';
import { State, type Option } from '../state';
import { newRoster, addSelection, chooseInGroup } from '../ops';
import type { Roster } from '../types';

const flat = (opts: Option[]): Option[] => opts.flatMap((o) => (o.children ? [o, ...flat(o.children)] : [o]));
const norm = (s: string) => s.toLowerCase().replace(/\[legends\]/g, '').replace(/[’'`]/g, '').replace(/[^a-z0-9]/g, '');

describe.each(factionKeys())('%s', (key) => {
  it('builds a legal-looking list with every datasheet', () => {
    const cat = loadFaction(key);
    let r: Roster = newRoster(cat, 'T', key);
    let st = new State(cat, r);
    const bs = st.topLevel().find((n) => n.def.name === 'Battle Size');
    if (bs) {
      const g = st.options(bs).find((o) => o.def.kind === 'group');
      const sf = g?.children?.find((c) => /Strike Force/.test(c.name));
      if (g && sf) r = chooseInGroup(cat, r, bs.uid, g, sf);
    }
    st = new State(cat, r);
    const det = st.topLevel().find((n) => n.def.name === 'Detachment');
    const detOpts = det ? flat(st.options(det)).filter((o) => !o.hidden && !o.children && o.dp > 0) : [];
    if (det && detOpts[0]) r = addSelection(cat, r, det.uid, detOpts[0].def, detOpts[0].gs).roster;
    st = new State(cat, r);
    const units = st.rootOptions().filter((o) => !o.hidden && o.def.kind === 'entry' && ['unit', 'model'].includes(o.def.type!));
    const problems: string[] = [];
    let noSheet = 0;
    for (const o of units) {
      const res = addSelection(cat, r, null, o.def);
      const s2 = new State(cat, res.roster);
      const node = s2.byUid.get(res.uid)!;
      expect(s2.points(node)).toBeGreaterThanOrEqual(0);
      const inUnit = (u?: string) => { for (let n = u ? s2.byUid.get(u) : undefined; n; n = n.parent) if (n === node) return true; return false; };
      for (const m of s2.validate()) if (m.level === 'error' && inUnit(m.uid) && /minimum|must be selected/.test(m.text)) problems.push(m.text);
      if (!cat.data.datasheets[norm(o.name)]) noSheet++;
    }
    const detRules = detOpts.filter((d) => cat.data.rules.detachments[norm(d.name)]).length;
    console.log(`${key}: ${units.length} units (${noSheet} without Wahapedia sheet), ${detOpts.length} detachments (${detRules} with rules), ${problems.length} default problems`);
    if (problems.length) console.log('  ' + [...new Set(problems)].slice(0, 8).join('\n  '));
    expect(units.length).toBeGreaterThan(0);
    // choices with no default in the rules (e.g. a Daemon Prince's Mark of Chaos) must be picked by the player
    expect(problems.filter((p) => !/Mark of Chaos/.test(p))).toEqual([]);
    expect(noSheet).toBeLessThanOrEqual(4);
  });
});
