import { useState } from 'react';
import type { Catalog } from '../engine/catalog';
import type { State, RNode } from '../engine/state';
import type { AbilityRef, WahaDatasheet } from '../engine/types';
import { norm, isEnhancement } from '../lib';
import { Rich, Sheet, bsText } from './common';

export function findSheet(cat: Catalog, name: string): WahaDatasheet | undefined {
  return cat.data.datasheets[norm(name)];
}

type Prof = ReturnType<State['profiles']>[number];
const ch = (p: Prof, k: string) => p.chars.find((c) => c.name === k)?.value ?? '';

export function Datasheet({ cat, name, st, node }: { cat: Catalog; name: string; st?: State; node?: RNode }) {
  const ws = findSheet(cat, name);
  const [ability, setAbility] = useState<{ name: string; html: string } | null>(null);
  const profiles = st && node ? st.profiles(node) : undefined;
  const openRef = (a: AbilityRef) => {
    const html = a.html ?? (a.ref ? cat.data.abilities[a.ref]?.html : '') ?? '';
    setAbility({ name: a.name, html });
  };

  // stats
  let statRows: { name: string; M: string; T: string; Sv: string; W: string; Ld: string; OC: string; inv?: string; mods?: Set<string> }[] = [];
  if (profiles?.some((p) => p.typeName === 'Unit')) {
    statRows = profiles
      .filter((p) => p.typeName === 'Unit')
      .map((p) => ({ name: p.name, M: ch(p, 'M'), T: ch(p, 'T'), Sv: ch(p, 'Sv'), W: ch(p, 'W'), Ld: ch(p, 'LD') || ch(p, 'Ld'), OC: ch(p, 'OC'), inv: ch(p, 'InSv') }));
    // highlight values changed by enhancements/wargear compared to the base datasheet
    if (ws) {
      for (const r of statRows) {
        const base = ws.models.find((m) => norm(m.name) === norm(r.name)) ?? ws.models[0];
        if (!base) continue;
        r.mods = new Set((['M', 'T', 'Sv', 'W', 'Ld', 'OC'] as const).filter((k) => String(base[k]).replace(/\D/g, '') !== String(r[k]).replace(/\D/g, '')));
      }
    }
  } else if (ws) {
    statRows = ws.models.map((m) => ({ name: m.name, M: m.M, T: m.T, Sv: m.Sv, W: m.W, Ld: m.Ld, OC: m.OC, inv: m.inv ? `${m.inv}+` : '' }));
  }

  // weapons
  type W = { name: string; count?: number; range: string; A: string; skill: string; S: string; AP: string; D: string; kw: string };
  let ranged: W[] = [];
  let melee: W[] = [];
  if (profiles && profiles.some((p) => /Weapons/.test(p.typeName))) {
    const conv = (p: Prof, skill: string): W => ({ name: p.name, count: p.count, range: ch(p, 'Range'), A: ch(p, 'A'), skill: ch(p, skill), S: ch(p, 'S'), AP: ch(p, 'AP'), D: ch(p, 'D'), kw: ch(p, 'Keywords').replace(/^-$/, '') });
    ranged = profiles.filter((p) => p.typeName === 'Ranged Weapons').map((p) => conv(p, 'BS'));
    melee = profiles.filter((p) => p.typeName === 'Melee Weapons').map((p) => conv(p, 'WS'));
  } else if (ws) {
    const conv = (w: WahaDatasheet['weapons'][number]): W => ({ name: w.name, range: w.range === 'Melee' ? 'Melee' : `${w.range}"`, A: w.A, skill: `${w.skill}+`, S: w.S, AP: w.AP, D: w.D, kw: w.kw });
    ranged = ws.weapons.filter((w) => w.type !== 'Melee').map(conv);
    melee = ws.weapons.filter((w) => w.type === 'Melee').map(conv);
  }

  // abilities from BSData when no wahapedia sheet, plus enhancement text for configured units
  const bsAbilities = profiles?.filter((p) => p.typeName === 'Abilities') ?? [];
  const enhancements: { name: string; text: string }[] = [];
  if (st && node) {
    const visit = (n: RNode) =>
      n.children.forEach((c) => {
        if (isEnhancement(st, c)) {
          const p = st.cat.infoTargets(c.def).profiles.find((x) => x.typeName === 'Abilities');
          enhancements.push({ name: st.name(c), text: p?.characteristics?.[0]?.$text ?? '' });
        }
        visit(c);
      });
    visit(node);
  }
  const transport = profiles?.find((p) => p.typeName === 'Transport');

  return (
    <div className="ds">
      <div className="ds-head">
        <h2>{st && node ? st.name(node) : ws?.name ?? name}</h2>
        {ws?.costs?.length ? (
          <div style={{ marginTop: 6, fontSize: 13 }}>
            {groupCosts(ws.costs).map((g, i) => (
              <div key={i}>
                <span className="muted">{g.head}</span> {g.lines.map((l) => `${l.text}: ${l.cost} pts`).join(' · ')}
              </div>
            ))}
          </div>
        ) : null}
        {ws?.legend && <div className="legend">{ws.legend}</div>}
      </div>

      {statRows.map((r, i) => (
        <div key={i}>
          {statRows.length > 1 && <div className="model-name">{r.name}</div>}
          <div className="stats">
            {(['M', 'T', 'Sv', 'W', 'Ld', 'OC'] as const).map((k) => (
              <div className="stat" key={k}>
                <div className="k">{k === 'Sv' ? 'SV' : k.toUpperCase()}</div>
                <div className={`v ${r.mods?.has(k) ? 'mod' : ''}`}>{r[k] || '-'}</div>
              </div>
            ))}
          </div>
          {r.inv && r.inv !== '-' && (
            <div className="invul">
              <b>{r.inv.replace('+', '')}+</b> Invulnerable save
            </div>
          )}
        </div>
      ))}

      {ranged.length > 0 && <WeaponTable title="Ranged Weapons" skill="BS" rows={ranged} />}
      {melee.length > 0 && <WeaponTable title="Melee Weapons" skill="WS" rows={melee} />}

      {enhancements.length > 0 && (
        <section className="ds-sec">
          <h3 style={{ color: 'var(--accent)' }}>Enhancement</h3>
          <div className="body">
            {enhancements.map((e) => (
              <div className="ability" key={e.name}>
                <div className="an">{e.name}</div>
                <Rich html={bsText(e.text)} />
              </div>
            ))}
          </div>
        </section>
      )}

      {ws ? (
        <section className="ds-sec">
          <h3>Abilities</h3>
          <div className="body">
            {ws.abilities.core.length > 0 && (
              <div className="ability">
                <div className="an muted" style={{ fontSize: 13 }}>Core</div>
                <div className="link-list">
                  {ws.abilities.core.map((a) => (
                    <button key={a.name} onClick={() => openRef(a)}>{a.name}</button>
                  ))}
                </div>
              </div>
            )}
            {ws.abilities.faction.length > 0 && (
              <div className="ability">
                <div className="an muted" style={{ fontSize: 13 }}>Faction</div>
                <div className="link-list">
                  {ws.abilities.faction.map((a) => (
                    <button key={a.name} onClick={() => openRef(a)}>{a.name}</button>
                  ))}
                </div>
              </div>
            )}
            {ws.abilities.datasheet.map((a) => (
              <div className="ability" key={a.name}>
                <div className="an">{a.name}</div>
                <Rich html={a.html ?? ''} />
              </div>
            ))}
          </div>
        </section>
      ) : (
        bsAbilities.length > 0 && (
          <section className="ds-sec">
            <h3>Abilities</h3>
            <div className="body">
              {bsAbilities.map((a) => (
                <div className="ability" key={a.id}>
                  <div className="an">{a.name}</div>
                  <Rich html={bsText(a.chars[0]?.value ?? '')} />
                </div>
              ))}
            </div>
          </section>
        )
      )}

      {ws && ws.abilities.wargear.length > 0 && (
        <section className="ds-sec">
          <h3>Wargear Abilities</h3>
          <div className="body">
            {ws.abilities.wargear.map((a) => (
              <div className="ability" key={a.name}>
                <div className="an">{a.name}</div>
                <Rich html={a.html ?? ''} />
              </div>
            ))}
          </div>
        </section>
      )}

      {ws?.damaged && (
        <section className="ds-sec">
          <h3>Damaged: {ws.damagedW} wounds remaining</h3>
          <div className="body"><Rich html={ws.damaged} /></div>
        </section>
      )}

      {(ws?.transport || transport) && (
        <section className="ds-sec">
          <h3>Transport</h3>
          <div className="body">{ws?.transport ? <Rich html={ws.transport} /> : <Rich html={bsText(transport?.chars[0]?.value ?? '')} />}</div>
        </section>
      )}

      {ws && (ws.composition.length > 0 || ws.loadout) && (
        <section className="ds-sec">
          <h3>Unit Composition</h3>
          <div className="body">
            {ws.composition.map((c, i) => <Rich key={i} html={`<p>${c}</p>`} />)}
            {ws.loadout && <Rich html={ws.loadout} />}
          </div>
        </section>
      )}

      {ws && ws.options.length > 0 && (
        <section className="ds-sec">
          <h3>Wargear Options</h3>
          <div className="body">
            <ul style={{ margin: 0 }}>
              {ws.options.map((o, i) => <li key={i}><Rich html={o} /></li>)}
            </ul>
          </div>
        </section>
      )}

      <LeaderSection ws={ws} cat={cat} name={name} profiles={profiles} />

      {ws && (
        <section className="ds-sec">
          <h3>Keywords</h3>
          <div className="body kwds">
            <div>{ws.keywords.join(', ')}</div>
            {ws.factionKeywords.length > 0 && (
              <div style={{ marginTop: 6 }}>
                <span className="muted">Faction: </span>
                <b>{ws.factionKeywords.join(', ')}</b>
              </div>
            )}
          </div>
        </section>
      )}

      {ws?.link && (
        <div className="footer-note">
          Rules text: <a href={ws.link} target="_blank" rel="noreferrer">Wahapedia</a> · Powered by Wahapedia
        </div>
      )}

      <Sheet open={!!ability} onClose={() => setAbility(null)} title={ability?.name}>
        <div className="pad">
          <Rich html={ability?.html ?? ''} />
        </div>
      </Sheet>
    </div>
  );
}

function LeaderSection({ ws, cat, name, profiles }: { ws?: WahaDatasheet; cat: Catalog; name: string; profiles?: Prof[] }) {
  let text = profiles?.find((p) => p.typeName === 'Abilities' && p.name === 'Leader')?.chars[0]?.value;
  if (!text) {
    // look the profile up on the datasheet definition
    for (const d of cat.forceDef._children ?? []) {
      if (norm(d.name) !== norm(name)) continue;
      const p = cat.infoTargets(d).profiles.find((x) => x.name === 'Leader');
      text = p?.characteristics?.[0]?.$text;
    }
  }
  if (!text && !ws?.leaderHead) return null;
  return (
    <section className="ds-sec">
      <h3>Leader</h3>
      <div className="body">{ws?.leaderHead ? <Rich html={ws.leaderHead + (ws.leaderFooter ?? '')} /> : <Rich html={bsText(text ?? '')} />}</div>
    </section>
  );
}

function WeaponTable({ title, skill, rows }: { title: string; skill: string; rows: { name: string; count?: number; range: string; A: string; skill: string; S: string; AP: string; D: string; kw: string }[] }) {
  return (
    <section className="ds-sec">
      <h3>{title}</h3>
      <table className="weapons">
        <thead>
          <tr>
            <th style={{ width: '40%' }}></th>
            <th>RANGE</th>
            <th>A</th>
            <th>{skill}</th>
            <th>S</th>
            <th>AP</th>
            <th>D</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((w, i) => (
            <tr key={i}>
              <td>
                {w.count && w.count > 1 ? <span className="cnt">{w.count}× </span> : null}
                {w.name}
                {w.kw && <span className="kw">[{w.kw}]</span>}
              </td>
              <td>{w.range}</td>
              <td>{w.A}</td>
              <td>{w.skill}</td>
              <td>{w.S}</td>
              <td>{w.AP}</td>
              <td>{w.D}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function groupCosts(costs: { text: string; cost: string }[]) {
  const groups: { head: string; lines: { text: string; cost: string }[] }[] = [];
  for (const c of costs) {
    if (!c.cost) groups.push({ head: titleCase(c.text), lines: [] });
    else {
      if (!groups.length) groups.push({ head: '', lines: [] });
      groups[groups.length - 1].lines.push(c);
    }
  }
  return groups.filter((g) => g.lines.length);
}

const titleCase = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();
