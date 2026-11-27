import { useState } from 'react';
import type { State } from '../engine/state';
import type { Stratagem } from '../engine/types';
import { detachments, norm } from '../lib';
import { Rich } from './common';

export function Rules({ st }: { st: State }) {
  const data = st.cat.data;
  const dets = detachments(st).filter((d) => d.dp > 0);
  const [filter, setFilter] = useState<'all' | 'your' | 'opp' | 'either'>('all');
  const detRules = dets.map((d) => ({ d, r: data.rules.detachments[norm(d.name)] }));
  const coreSeen = new Set<string>();
  const core = data.rules.coreStratagems.filter((s) => {
    const k = s.name;
    if (coreSeen.has(k)) return false;
    coreSeen.add(k);
    return true;
  });
  const allStrats = [...detRules.flatMap(({ r }) => r?.stratagems ?? []), ...core];
  const counts = {
    your: allStrats.filter((s) => turnClass(s) === 'your').length,
    opp: allStrats.filter((s) => turnClass(s) === 'opp').length,
    either: allStrats.filter((s) => turnClass(s) === 'either').length,
  };
  const keep = (s: Stratagem) => filter === 'all' || turnClass(s) === filter;
  return (
    <div>
      <div className="section-h">Faction Rules</div>
      {data.rules.factionRules.map((f) => (
        <Collapsible key={f.name} title={f.name}>
          <Rich html={f.html} />
        </Collapsible>
      ))}

      {detRules.length === 0 && <p className="pad muted">Choose a detachment in Army settings to see its rules and stratagems.</p>}
      {detRules.map(({ d, r }) => (
        <div key={d.name}>
          <div className="section-h">
            {d.name} <span className="count">{d.dp} DP</span>
          </div>
          {!r && <p className="pad muted">No rules text found for this detachment.</p>}
          {r?.rules.map((x) => (
            <Collapsible key={x.name} title={x.name} kicker="Detachment rule" open>
              <Rich html={x.html} />
            </Collapsible>
          ))}
          {r && r.enhancements.length > 0 && (
            <Collapsible title="Enhancements" kicker={`${r.enhancements.length} available`}>
              {r.enhancements.map((e) => (
                <div className="ability" key={e.name}>
                  <div className="an">
                    {e.name} <span style={{ color: 'var(--accent)' }}>· {e.cost} pts</span>
                  </div>
                  <Rich html={e.html} />
                </div>
              ))}
            </Collapsible>
          )}
        </div>
      ))}

      <div className="section-h">Stratagems</div>
      <div className="chips">
        <button className={`chip ${filter === 'all' ? 'on' : ''}`} onClick={() => setFilter('all')}>All ({allStrats.length})</button>
        <button className={`chip ${filter === 'your' ? 'on' : ''}`} onClick={() => setFilter('your')}>Your turn ({counts.your})</button>
        <button className={`chip ${filter === 'opp' ? 'on' : ''}`} onClick={() => setFilter('opp')}>Opponent's turn ({counts.opp})</button>
        <button className={`chip ${filter === 'either' ? 'on' : ''}`} onClick={() => setFilter('either')}>Either turn ({counts.either})</button>
      </div>
      {detRules.map(({ d, r }) =>
        r?.stratagems.filter(keep).length ? (
          <div key={'s' + d.name}>
            <div className="section-h" style={{ paddingTop: 8, fontSize: 13 }}>{d.name}</div>
            {r.stratagems.filter(keep).map((s) => <StratCard key={s.name} s={s} />)}
          </div>
        ) : null,
      )}
      {core.filter(keep).length > 0 && (
        <>
          <div className="section-h" style={{ paddingTop: 8, fontSize: 13 }}>Core Stratagems</div>
          {core.filter(keep).map((s) => <StratCard key={s.name} s={s} />)}
        </>
      )}
      <div className="footer-note">Rules text powered by Wahapedia</div>
    </div>
  );
}

function turnClass(s: Stratagem): 'your' | 'opp' | 'either' {
  if (/^your/i.test(s.turn)) return 'your';
  if (/opponent/i.test(s.turn)) return 'opp';
  return 'either';
}

function StratCard({ s }: { s: Stratagem }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`strat ${turnClass(s)}`}>
      <button className="strat-h" onClick={() => setOpen(!open)} aria-expanded={open}>
        <div className="nm">
          <b>{s.name}</b>
          <span>
            {s.type.replace(/ Stratagem$/, '')} · {s.turn} · {s.phase}
          </span>
        </div>
        <div className="cp">{s.cp}CP</div>
      </button>
      {open && (
        <div className="body">
          {s.legend && <div className="legend">{s.legend}</div>}
          <Rich html={s.html} />
        </div>
      )}
    </div>
  );
}

function Collapsible({ title, kicker, open: initial = false, children }: { title: string; kicker?: string; open?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(initial);
  return (
    <section className="ds-sec" style={{ marginTop: 0, marginBottom: 10 }}>
      <h3 onClick={() => setOpen(!open)} style={{ cursor: 'pointer' }} role="button" aria-expanded={open}>
        <span style={{ flex: 1 }}>{title}</span>
        {kicker && <span className="muted" style={{ fontFamily: 'var(--body)', fontSize: 12, letterSpacing: 0, textTransform: 'none' }}>{kicker}</span>}
        <span className="muted">{open ? '−' : '+'}</span>
      </h3>
      {open && <div className="body">{children}</div>}
    </section>
  );
}
