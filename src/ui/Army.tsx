import { useCallback, useEffect, useMemo, useState } from 'react';
import { State, type RNode, type Option } from '../engine/state';
import type { Roster } from '../engine/types';
import { addSelection, duplicateSelection, removeSelection, setAssociation, clone, uid } from '../engine/ops';
import {
  back, battleSize, useAccent, detachments, fmt, go, isConfig, loadCatalog, sectionFor, sectionForCategory, SECTION_ORDER, store, unitSummary, useAsync, useRosters, vibrate,
} from '../lib';
import { exportText, toShareCode } from '../export';
import { AppBar, Loading, RoleIcon, Sheet, toast } from './common';
import { Datasheet } from './Datasheet';
import { OptionCards } from './Options';
import { Rules } from './Rules';
import * as I from './icons';

function useArmy(id: string) {
  const rosters = useRosters();
  const roster = rosters.find((r) => r.id === id);
  useAccent(roster?.faction);
  const catQ = useAsync(() => (roster ? loadCatalog(roster.faction) : Promise.reject(new Error('Army not found'))), [roster?.faction]);
  const st = useMemo(() => (catQ.value && roster ? new State(catQ.value, roster) : undefined), [catQ.value, roster]);
  const update = useCallback((r: Roster) => store.put({ ...r, updated: Date.now() }), []);
  return { roster, cat: catQ.value, st, update, error: !roster ? 'This army no longer exists.' : catQ.error?.message };
}

function Guard({ a, children }: { a: ReturnType<typeof useArmy>; children: (st: State, r: Roster) => JSX.Element }) {
  if (a.error)
    return (
      <>
        <AppBar title="Army" onBack="" />
        <div className="empty"><p>{a.error}</p><button className="btn" onClick={() => go('', true)}>Back to armies</button></div>
      </>
    );
  if (!a.st || !a.roster) return <Loading text="Loading army…" />;
  return children(a.st, a.roster);
}

// ------------------------------------------------------------------ points bar
function PointsBar({ st }: { st: State }) {
  const l = st.limits();
  const over = l.pointsLimit > 0 && l.points > l.pointsLimit;
  return (
    <div className="pointsbar">
      <div className={`pts-pill ${over ? 'over' : ''}`}>
        <div className="l">Points</div>
        <div className="v">
          {fmt(l.points)} {l.pointsLimit > 0 && <small>/ {fmt(l.pointsLimit)}</small>}
        </div>
        {l.pointsLimit > 0 && (
          <div className="meter"><i style={{ width: `${Math.min(100, (l.points / l.pointsLimit) * 100)}%` }} /></div>
        )}
      </div>
      <div className={`pts-pill small ${l.dp > l.dpLimit ? 'over' : ''}`}>
        <div className="l">DP</div>
        <div className="v">{l.dp}<small>/{l.dpLimit}</small></div>
      </div>
      <div className={`pts-pill small ${l.enh > l.enhLimit ? 'over' : ''}`}>
        <div className="l">Enh.</div>
        <div className="v">{l.enh}<small>/{l.enhLimit}</small></div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ army screen
export function ArmyScreen({ id, tab }: { id: string; tab: 'roster' | 'rules' }) {
  const a = useArmy(id);
  const [menu, setMenu] = useState(false);
  const [issues, setIssues] = useState(false);
  return (
    <Guard a={a}>
      {(st, r) => {
        const msgs = st.validate();
        const errors = msgs.filter((m) => m.level === 'error');
        const bs = battleSize(st);
        const dets = detachments(st).filter((d) => d.dp > 0);
        const units = st.topLevel().filter((n) => !isConfig(st, n));
        const attachedSet = new Set(units.flatMap((u) => st.attachedTo(u)).map((n) => n.uid));
        const errUids = new Set(errors.map((e) => e.uid).filter(Boolean));
        const forceDisp = st.topLevel().find((n) => n.def.name === 'Force Disposition')?.children[0];
        return (
          <>
            <AppBar
              title={r.name}
              sub={`${st.cat.data.name}${bs ? ` · ${bs.name}` : ''}`}
              onBack=""
              right={
                <>
                  <button className="icon-btn" aria-label="Export" onClick={() => go(`army/${id}/export`)}><I.IconShare /></button>
                  <button className="icon-btn" aria-label="More" onClick={() => setMenu(true)}><I.IconMore /></button>
                </>
              }
            />
            <PointsBar st={st} />
            <div className="tabs" style={{ top: 'calc(var(--safe-top) + 57px + 66px)' }}>
              <button className={tab === 'roster' ? 'on' : ''} onClick={() => go(`army/${id}`, true)}>Roster</button>
              <button className={tab === 'rules' ? 'on' : ''} onClick={() => go(`army/${id}/rules`, true)}>Army Rules</button>
            </div>
            {tab === 'rules' ? (
              <main className="screen"><Rules st={st} /></main>
            ) : (
              <main className="screen">
                <button className="det-card" onClick={() => go(`army/${id}/settings`)}>
                  <div className="main">
                    <div className="k">Detachments</div>
                    <div className="v">{dets.length ? dets.map((d) => d.name).join(' · ') : 'Choose detachments'}</div>
                    <div className="muted" style={{ fontSize: 13 }}>
                      {forceDisp ? `Force Disposition: ${st.name(forceDisp)}` : 'No force disposition chosen'}
                    </div>
                  </div>
                  <I.IconSettings />
                </button>
                {errors.length > 0 ? (
                  <button className="banner" onClick={() => setIssues(true)}>
                    <I.IconWarn />
                    <span style={{ flex: 1 }}>{errors.length} issue{errors.length > 1 ? 's' : ''} with this army</span>
                    <I.IconChevron />
                  </button>
                ) : units.length > 0 ? (
                  <div className="banner ok"><I.IconCheck /> Army is valid</div>
                ) : null}
                {units.length === 0 && (
                  <div className="empty">
                    <h2>Empty roster</h2>
                    <p>Tap “Add Units” to start building your army.</p>
                  </div>
                )}
                {SECTION_ORDER.map((sec) => {
                  const list = units.filter((n) => sectionFor(st, n) === sec && !attachedSet.has(n.uid));
                  if (!list.length) return null;
                  const pts = list.reduce((t, n) => t + st.pointsWithAttached(n), 0);
                  return (
                    <div key={sec}>
                      <div className="section-h">
                        {sec} <span className="count">{fmt(pts)} pts</span>
                      </div>
                      <div className="list">
                        {list.map((n) => {
                            return (
                              <div key={n.uid} style={{ display: 'contents' }}>
                                <UnitRow st={st} n={n} armyId={id} err={errUids.has(n.uid)} />
                                {st.attachedTo(n).map((ln) => (
                                  <UnitRow key={ln.uid} st={st} n={ln} armyId={id} err={errUids.has(ln.uid)} attached={st.name(n)} />
                                ))}
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  );
                })}
              </main>
            )}
            {tab === 'roster' && (
              <button className="fab" onClick={() => go(`army/${id}/add`)}>
                <I.IconPlus /> Add Units
              </button>
            )}
            <Sheet open={issues} onClose={() => setIssues(false)} title="Army issues">
              <ul className="issues" style={{ listStyle: 'none', margin: 0 }}>
                {msgs.map((m, i) => (
                  <li key={i} className={m.level}>
                    {m.level === 'error' ? '⚠ ' : 'ℹ '}
                    {m.text}
                  </li>
                ))}
              </ul>
            </Sheet>
            <Sheet open={menu} onClose={() => setMenu(false)} title={r.name}>
              <button className="menu-item" onClick={() => { setMenu(false); go(`army/${id}/settings`); }}><I.IconSettings /> Army settings</button>
              <button className="menu-item" onClick={() => { setMenu(false); go(`army/${id}/export`); }}><I.IconExport /> Export / share</button>
              <button
                className="menu-item"
                onClick={() => {
                  const c = clone(r);
                  const nr = { ...c, id: uid(), name: `${c.name} (copy)`, created: Date.now(), updated: Date.now() };
                  store.put(nr);
                  setMenu(false);
                  go(`army/${nr.id}`);
                  toast('Army duplicated');
                }}
              >
                <I.IconDup /> Duplicate army
              </button>
              <button
                className="menu-item danger"
                onClick={() => {
                  if (confirm(`Delete "${r.name}"?`)) {
                    store.remove(r.id);
                    go('', true);
                  }
                }}
              >
                <I.IconTrash /> Delete army
              </button>
            </Sheet>
          </>
        );
      }}
    </Guard>
  );
}

function UnitRow({ st, n, armyId, err, attached }: { st: State; n: RNode; armyId: string; err?: boolean; attached?: string }) {
  const s = unitSummary(st, n);
  const sec = sectionFor(st, n);
  const cat = st.primaryCategory(n);
  return (
    <button className={`row ${err ? 'err' : ''} ${attached ? 'attached' : ''}`} onClick={() => go(`army/${armyId}/unit/${n.uid}`)}>
      <div className="thumb"><RoleIcon section={sec} category={cat ? st.cat.categoryName(cat) : ''} /></div>
      <div className="main">
        <div className="name">{st.name(n)}</div>
        <div className="meta">
          {s.warlord && <span className="tag gold">Warlord</span>}
          {s.enhancement && <span className="tag gold">{s.enhancement}</span>}
          {attached && <span className="tag">Leading {attached}</span>}
          {s.models > 1 && <span>{s.models} models</span>}
          {err && <span className="tag red">Issue</span>}
        </div>
      </div>
      <div className="pts">{st.points(n)}<small> pts</small></div>
    </button>
  );
}

// ------------------------------------------------------------------ add units
export function AddUnits({ id }: { id: string }) {
  const a = useArmy(id);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('All');
  return (
    <Guard a={a}>
      {(st, r) => {
        const opts = st.rootOptions().filter((o) => !o.hidden && o.def.kind === 'entry');
        const withSec = opts
          .map((o) => {
            const v = st.virtual(st.force, o.def);
            const pc = st.primaryCategory(v);
            const catName = pc ? st.cat.categoryName(pc) : '';
            return { o, sec: sectionForCategory(catName), catName };
          })
          .filter((x) => x.sec !== 'Configuration');
        const present = SECTION_ORDER.filter((s) => withSec.some((x) => x.sec === s));
        const ql = q.trim().toLowerCase();
        const shown = withSec.filter((x) => (filter === 'All' || x.sec === filter) && (!ql || x.o.name.toLowerCase().includes(ql)));
        const countOf = (o: Option) => st.topLevel().filter((n) => n.def.id === o.def.id).length;
        const add = (o: Option) => {
          vibrate();
          const res = addSelection(st.cat, r, null, o.def);
          a.update(res.roster);
          toast(`Added ${o.name}`);
        };
        return (
          <>
            <AppBar title="Add Units" sub={`${fmt(st.points())}${st.limits().pointsLimit ? ` / ${fmt(st.limits().pointsLimit)}` : ''} pts`} onBack={`army/${id}`} />
            <div className="search">
              <input className="input" type="search" placeholder="Search datasheets" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search datasheets" />
            </div>
            <div className="chips">
              {['All', ...present].map((s) => (
                <button key={s} className={`chip ${filter === s ? 'on' : ''}`} onClick={() => setFilter(s)}>{s}</button>
              ))}
            </div>
            <main className="screen" style={{ paddingBottom: 'calc(var(--safe-bottom) + 24px)' }}>
              {present.map((sec) => {
                const list = shown.filter((x) => x.sec === sec);
                if (!list.length) return null;
                return (
                  <div key={sec}>
                    <div className="section-h">{sec}</div>
                    <div className="list">
                      {list.map(({ o, catName }) => {
                        const c = countOf(o);
                        return (
                          <div className="row" key={o.def.id} role="button" tabIndex={0} onClick={() => go(`army/${id}/ds/${o.def.id}`)}>
                            <div className="thumb"><RoleIcon section={sec} category={catName} /></div>
                            <div className="main">
                              <div className="name">{o.name}</div>
                              <div className="meta">
                                {c > 0 && <span className="tag gold">{c} in army</span>}
                                <span>{catName}</span>
                              </div>
                            </div>
                            <div className="pts">{o.cost}<small> pts</small></div>
                            <button className="add-btn" aria-label={`Add ${o.name}`} onClick={(e) => { e.stopPropagation(); add(o); }}>
                              <I.IconPlus />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
              {!shown.length && <div className="empty"><p>No datasheets match “{q}”.</p></div>}
              <p className="footer-note">Legends and other optional content can be enabled in Army settings → Show/Hide Options.</p>
            </main>
          </>
        );
      }}
    </Guard>
  );
}

export function BrowseDatasheet({ id, defId }: { id: string; defId: string }) {
  const a = useArmy(id);
  return (
    <Guard a={a}>
      {(st, r) => {
        const def = st.cat.getDef(defId);
        if (!def) return <div className="pad">Unknown datasheet</div>;
        const opt = st.rootOptions().find((o) => o.def.id === defId);
        // preview with default wargear
        const preview = addSelection(st.cat, r, null, def);
        const pst = new State(st.cat, preview.roster);
        const pnode = pst.byUid.get(preview.uid)!;
        return (
          <>
            <AppBar title={def.name} sub={opt ? `${opt.cost} pts` : undefined} onBack={`army/${id}/add`} />
            <main className="screen">
              <Datasheet cat={st.cat} name={def.name} st={pst} node={pnode} />
            </main>
            {opt && !opt.hidden && (
              <div className="bottom-bar">
                <button
                  className="btn primary block"
                  onClick={() => {
                    a.update(preview.roster);
                    toast(`Added ${def.name}`);
                    back(`army/${id}/add`);
                  }}
                >
                  <I.IconPlus /> Add to army · {opt.cost} pts
                </button>
              </div>
            )}
          </>
        );
      }}
    </Guard>
  );
}

// ------------------------------------------------------------------ unit
export function UnitScreen({ id, unitUid, tab }: { id: string; unitUid: string; tab: 'config' | 'sheet' }) {
  const a = useArmy(id);
  const [menu, setMenu] = useState(false);
  return (
    <Guard a={a}>
      {(st, r) => {
        const node = st.byUid.get(unitUid);
        if (!node) {
          return (
            <>
              <AppBar title="Unit" onBack={`army/${id}`} />
              <div className="empty"><p>This unit has been removed.</p></div>
            </>
          );
        }
        const ctx = { st, roster: r, update: a.update };
        const msgs = st.validate().filter((m) => m.uid === unitUid || (m.uid && isDescendant(st, m.uid, node)));
        const assocs = st.associations(node);
        const attached = st.attachedTo(node);
        return (
          <>
            <AppBar
              title={st.name(node)}
              sub={`${st.points(node)} pts${attached.length ? ` · ${st.pointsWithAttached(node)} pts with attached` : ''}`}
              onBack={`army/${id}`}
              right={<button className="icon-btn" aria-label="Unit options" onClick={() => setMenu(true)}><I.IconMore /></button>}
            />
            <div className="tabs" style={{ top: 'calc(var(--safe-top) + 57px)' }}>
              <button className={tab === 'config' ? 'on' : ''} onClick={() => go(`army/${id}/unit/${unitUid}`, true)}>Configure</button>
              <button className={tab === 'sheet' ? 'on' : ''} onClick={() => go(`army/${id}/unit/${unitUid}/sheet`, true)}>Datasheet</button>
            </div>
            <main className="screen">
              {tab === 'sheet' ? (
                <Datasheet cat={st.cat} name={node.def.name} st={st} node={node} />
              ) : (
                <div style={{ paddingTop: 12 }}>
                  {msgs.length > 0 && (
                    <div className="opt-card" style={{ background: 'rgba(229,83,75,0.12)' }}>
                      <ul className="issues" style={{ listStyle: 'none', margin: 0, padding: '6px 14px' }}>
                        {msgs.map((m, i) => <li key={i} style={{ borderColor: 'transparent', color: '#ffb1ab' }}>⚠ {m.text}</li>)}
                      </ul>
                    </div>
                  )}
                  {assocs.map((as) => (
                    <div className="opt-card" key={as.assoc.id}>
                      <h3>{as.label === 'Leader' ? 'Lead a unit' : as.label}<span className="hint">Attach to a bodyguard unit</span></h3>
                      <button className={`opt ${as.targets.length === 0 ? 'on' : ''}`} onClick={() => a.update(setAssociation(r, unitUid, as.assoc.id, []))}>
                        <span className="radio" />
                        <span className="label"><span className="n">Not attached</span></span>
                      </button>
                      {as.candidates.map((c) => {
                        const on = as.targets.includes(c);
                        const taken = st.attachedTo(c).filter((x) => x !== node);
                        return (
                          <button
                            key={c.uid}
                            className={`opt ${on ? 'on' : ''}`}
                            onClick={() => { vibrate(); a.update(setAssociation(r, unitUid, as.assoc.id, as.max === 1 ? [c.uid] : on ? as.targets.filter((t) => t !== c).map((t) => t.uid) : [...as.targets.map((t) => t.uid), c.uid])); }}
                          >
                            <span className={as.max === 1 ? 'radio' : 'check'} />
                            <span className="label">
                              <span className="n">{st.name(c)}</span>
                              <span className="c"> · {st.points(c)} pts{taken.length ? ` · led by ${taken.map((t) => st.name(t)).join(', ')}` : ''}</span>
                            </span>
                          </button>
                        );
                      })}
                      {as.candidates.length === 0 && <div className="opt muted">No eligible units in your army yet.</div>}
                    </div>
                  ))}
                  {attached.length > 0 && (
                    <div className="opt-card">
                      <h3>Attached units</h3>
                      {attached.map((u) => (
                        <button className="opt" key={u.uid} onClick={() => go(`army/${id}/unit/${u.uid}`)}>
                          <span className="label"><span className="n">{st.name(u)}</span><span className="c"> · {st.points(u)} pts</span></span>
                          <I.IconChevron />
                        </button>
                      ))}
                    </div>
                  )}
                  <OptionCards ctx={ctx} node={node} />
                </div>
              )}
            </main>
            {tab === 'config' && <div className="bottom-bar">
              <button className="btn block" onClick={() => { a.update(duplicateSelection(r, unitUid)); toast('Unit duplicated'); }}>
                <I.IconDup /> Duplicate
              </button>
              <button className="btn danger block" onClick={() => { a.update(removeSelection(r, unitUid)); toast('Unit removed'); back(`army/${id}`); }}>
                <I.IconTrash /> Remove
              </button>
            </div>}
            <Sheet open={menu} onClose={() => setMenu(false)} title={st.name(node)}>
              <button className="menu-item" onClick={() => { setMenu(false); go(`army/${id}/unit/${unitUid}/sheet`, true); }}><I.IconBook /> View datasheet</button>
              <button className="menu-item" onClick={() => { setMenu(false); a.update(duplicateSelection(r, unitUid)); toast('Unit duplicated'); }}><I.IconDup /> Duplicate unit</button>
              <button className="menu-item danger" onClick={() => { setMenu(false); a.update(removeSelection(r, unitUid)); back(`army/${id}`); }}><I.IconTrash /> Remove unit</button>
            </Sheet>
          </>
        );
      }}
    </Guard>
  );
}

function isDescendant(st: State, u: string, node: RNode) {
  for (let n = st.byUid.get(u); n; n = n.parent) if (n === node) return true;
  return false;
}

// ------------------------------------------------------------------ settings
export function Settings({ id, isNew }: { id: string; isNew?: boolean }) {
  const a = useArmy(id);
  return (
    <Guard a={a}>
      {(st, r) => {
        const ctx = { st, roster: r, update: a.update };
        const config = st.topLevel().filter((n) => isConfig(st, n) && st.primaryCategory(n) && st.cat.categoryName(st.primaryCategory(n)!) === 'Configuration');
        const extra = st
          .rootOptions()
          .filter((o) => !o.hidden && o.def.kind === 'entry' && o.count === 0)
          .filter((o) => {
            const pc = st.primaryCategory(st.virtual(st.force, o.def));
            return pc && st.cat.categoryName(pc) === 'Configuration';
          });
        const order = ['Battle Size', 'Detachment', 'Force Disposition'];
        config.sort((x, y) => (order.indexOf(x.def.name) + 1 || 99) - (order.indexOf(y.def.name) + 1 || 99));
        return (
          <>
            <AppBar title={isNew ? 'Set up army' : 'Army Settings'} sub={r.name} onBack={isNew ? undefined : `army/${id}`} />
            <PointsBar st={st} />
            <main className="screen" style={{ paddingTop: 12 }}>
              <div className="pad" style={{ paddingTop: 0 }}>
                <div className="field" style={{ marginBottom: 4 }}>
                  <label htmlFor="nm">Army name</label>
                  <input id="nm" className="input" value={r.name} onChange={(e) => a.update({ ...r, name: e.target.value })} autoComplete="off" />
                </div>
              </div>
              {config.map((n) => (
                <div key={n.uid}>
                  {n.def.name === 'Detachment' && (
                    <div className="section-h" style={{ paddingTop: 8 }}>
                      Detachments <span className="count">{st.limits().dp}/{st.limits().dpLimit} DP used</span>
                    </div>
                  )}
                  <OptionCards ctx={ctx} node={n} />
                  {n.def.name === 'Force Disposition' && st.options(n).every((o) => o.hidden || o.children?.every((c) => c.hidden)) && (
                    <p className="muted pad" style={{ paddingTop: 0, fontSize: 14 }}>Choose a detachment first: each one unlocks its force dispositions.</p>
                  )}
                </div>
              ))}
              {extra.length > 0 && (
                <>
                  <div className="section-h">Optional content</div>
                  <div className="opt-card">
                    {extra.map((o) => (
                      <button key={o.def.id} className="opt" onClick={() => a.update(addSelection(st.cat, r, null, o.def).roster)}>
                        <span className="check" />
                        <span className="label"><span className="n">{o.name}</span><span className="c"> · e.g. Legends datasheets</span></span>
                      </button>
                    ))}
                  </div>
                </>
              )}
              {config
                .filter((n) => !['Battle Size', 'Detachment', 'Force Disposition'].includes(n.def.name))
                .map((n) => (
                  <div className="pad" key={'rm' + n.uid} style={{ paddingTop: 0 }}>
                    <button className="btn block" onClick={() => a.update(removeSelection(r, n.uid))}>Remove {st.name(n)}</button>
                  </div>
                ))}
            </main>
            <div className="bottom-bar">
              <button className="btn primary block" onClick={() => (isNew ? go(`army/${id}`, true) : back(`army/${id}`))}>
                {isNew ? 'Start adding units' : 'Done'}
              </button>
            </div>
          </>
        );
      }}
    </Guard>
  );
}

// ------------------------------------------------------------------ export
export function ExportScreen({ id }: { id: string }) {
  const a = useArmy(id);
  const [link, setLink] = useState('');
  useEffect(() => {
    if (a.roster) toShareCode(a.roster).then((c) => setLink(`${location.origin}${location.pathname}#/import/${c}`));
  }, [a.roster]);
  return (
    <Guard a={a}>
      {(st, r) => {
        const text = exportText(st, r);
        const copy = async (s: string, what: string) => {
          try {
            await navigator.clipboard.writeText(s);
            toast(`${what} copied`);
          } catch {
            toast('Copy failed – select and copy manually');
          }
        };
        return (
          <>
            <AppBar title="Export Army" sub={r.name} onBack={`army/${id}`} />
            <main className="screen pad">
              <div className="field">
                <label>Army list (text)</label>
                <textarea className="input" readOnly value={text} style={{ minHeight: 320 }} onFocus={(e) => e.currentTarget.select()} />
              </div>
              <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
                <button className="btn primary block" onClick={() => copy(text, 'List')}><I.IconCopy /> Copy text</button>
                {'share' in navigator && (
                  <button className="btn block" onClick={() => navigator.share({ title: r.name, text }).catch(() => undefined)}><I.IconShare /> Share</button>
                )}
              </div>
              <div className="field">
                <label>Share link (opens this exact list in the builder)</label>
                <input className="input" readOnly value={link} onFocus={(e) => e.currentTarget.select()} />
              </div>
              <button className="btn block" disabled={!link} onClick={() => copy(link, 'Link')}><I.IconLink /> Copy share link</button>
            </main>
          </>
        );
      }}
    </Guard>
  );
}
