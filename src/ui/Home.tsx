import { useEffect, useMemo, useState } from 'react';
import { go, loadCatalog, loadIndex, store, useAsync, useRosters, fmt, detachments, battleSize, back } from '../lib';
import { State } from '../engine/state';
import { chooseInGroup, newRoster, clone, uid } from '../engine/ops';
import type { Roster } from '../engine/types';
import { fromShareCode } from '../export';
import { AppBar, Loading, Sheet, toast } from './common';
import { Crest, IconDup, IconImport, IconMore, IconPlus, IconTrash, IconEdit, IconChevron } from './icons';

export function Home() {
  const rosters = useRosters();
  const [menu, setMenu] = useState<Roster | null>(null);
  return (
    <>
      <AppBar
        title="Army Builder"
        sub="Warhammer 40,000 · 11th Edition"
        right={
          <button className="icon-btn" aria-label="Import army" onClick={() => go('import')}>
            <IconImport />
          </button>
        }
      />
      <main className="screen">
        {rosters.length === 0 ? (
          <div className="empty">
            <Crest />
            <h2>No armies yet</h2>
            <p>Create your first army list. Lists are saved on this device and work offline.</p>
            <button className="btn primary" onClick={() => go('new')} style={{ marginTop: 12 }}>
              <IconPlus /> New Army
            </button>
          </div>
        ) : (
          <>
            <div className="section-h">
              My Armies <span className="count">{rosters.length}</span>
            </div>
            <div className="list">
              {[...rosters].sort((a, b) => b.updated - a.updated).map((r) => (
                <ArmyCard key={r.id} r={r} onMenu={() => setMenu(r)} />
              ))}
            </div>
          </>
        )}
        <Footer />
      </main>
      {rosters.length > 0 && (
        <button className="fab" onClick={() => go('new')}>
          <IconPlus /> New Army
        </button>
      )}
      <Sheet open={!!menu} onClose={() => setMenu(null)} title={menu?.name}>
        <button className="menu-item" onClick={() => { const r = menu!; setMenu(null); go(`army/${r.id}/settings`); }}>
          <IconEdit /> Rename / Army settings
        </button>
        <button
          className="menu-item"
          onClick={() => {
            const c = clone(menu!);
            store.put({ ...c, id: uid(), name: `${c.name} (copy)`, created: Date.now(), updated: Date.now() });
            setMenu(null);
            toast('Army duplicated');
          }}
        >
          <IconDup /> Duplicate
        </button>
        <button
          className="menu-item danger"
          onClick={() => {
            if (confirm(`Delete "${menu!.name}"? This cannot be undone.`)) {
              store.remove(menu!.id);
              setMenu(null);
            }
          }}
        >
          <IconTrash /> Delete
        </button>
      </Sheet>
    </>
  );
}

function ArmyCard({ r, onMenu }: { r: Roster; onMenu: () => void }) {
  const cat = useAsync(() => loadCatalog(r.faction), [r.faction]).value;
  const info = useMemo(() => {
    if (!cat) return undefined;
    const st = new State(cat, r);
    const lim = st.limits();
    return { lim, dets: detachments(st).filter((d) => d.dp > 0).map((d) => d.name), bs: battleSize(st), errors: st.validate().filter((m) => m.level === 'error').length };
  }, [cat, r]);
  return (
    <div className="army-card" role="button" tabIndex={0} onClick={() => go(`army/${r.id}`)}>
      <div className="crest">
        <Crest />
      </div>
      <div className="main">
        <div className="nm">{r.name}</div>
        <div className="fac">{cat?.data.name ?? r.faction}{info?.bs ? ` · ${info.bs.name}` : ''}</div>
        <div className="det">{info?.dets.join(', ') || 'No detachment'}{info?.errors ? ` · ${info.errors} issue${info.errors > 1 ? 's' : ''}` : ''}</div>
      </div>
      <div className="p">
        {info ? fmt(info.lim.points) : '…'}
        <small>{info?.lim.pointsLimit ? `/ ${fmt(info.lim.pointsLimit)} pts` : 'pts'}</small>
      </div>
      <button className="icon-btn" aria-label="Army options" onClick={(e) => { e.stopPropagation(); onMenu(); }}>
        <IconMore />
      </button>
    </div>
  );
}

function Footer() {
  const idx = useAsync(loadIndex, []).value;
  return (
    <div className="footer-note">
      Unofficial fan-made tool. Not affiliated with Games Workshop.
      <br />
      Data: BSData (wh40k-11e) & Powered by Wahapedia
      {idx?.sources.wahapedia.lastUpdate ? ` · rules updated ${idx.sources.wahapedia.lastUpdate.slice(0, 10)}` : ''}
    </div>
  );
}

export function NewArmy() {
  const idx = useAsync(loadIndex, []);
  const [faction, setFaction] = useState<string | null>(null);
  if (idx.error) return <div className="pad">Could not load data: {String(idx.error)}</div>;
  if (!idx.value) return <Loading />;
  if (!faction) {
    const alliances = [...new Set(idx.value.factions.map((f) => f.alliance))];
    return (
      <>
        <AppBar title="Choose Faction" onBack="" />
        <main className="screen">
          {alliances.map((a) => (
            <div key={a}>
              <div className="section-h">{a}</div>
              <div className="list">
                {idx.value!.factions.filter((f) => f.alliance === a).map((f) => (
                  <button className="row" key={f.key} onClick={() => setFaction(f.key)}>
                    <div className="thumb"><Crest /></div>
                    <div className="main"><div className="name">{f.name}</div></div>
                    <IconChevronSmall />
                  </button>
                ))}
              </div>
            </div>
          ))}
          <p className="footer-note">More factions will be added once Adeptus Custodes is confirmed working.</p>
        </main>
      </>
    );
  }
  return <NewArmyForm faction={faction} onBack={() => setFaction(null)} />;
}

const IconChevronSmall = () => <span style={{ color: 'var(--faint)', width: 24, height: 24, display: 'grid' }}><IconChevron /></span>;

function NewArmyForm({ faction, onBack }: { faction: string; onBack: () => void }) {
  const catQ = useAsync(() => loadCatalog(faction), [faction]);
  const cat = catQ.value;
  const [name, setName] = useState('');
  const [size, setSize] = useState<string | null>(null);
  const base = useMemo(() => (cat ? newRoster(cat, '', faction) : undefined), [cat, faction]);
  const sizes = useMemo(() => {
    if (!cat || !base) return [];
    const st = new State(cat, base);
    const bs = st.topLevel().find((n) => n.def.name === 'Battle Size');
    const g = bs && st.options(bs).find((o) => o.def.kind === 'group');
    return g ? g.children!.filter((c) => !c.hidden).map((c) => ({ id: c.def.id, label: c.name.replace(/^\d+\.\s*/, ''), opt: c, g, bs })) : [];
  }, [cat, base]);
  useEffect(() => {
    if (!size && sizes.length) setSize(sizes.find((s) => /Strike Force/.test(s.label))?.id ?? sizes[0].id);
  }, [sizes, size]);
  if (catQ.error) return <div className="pad">Could not load faction: {String(catQ.error)}</div>;
  if (!cat || !base) return <Loading text="Loading faction data…" />;
  const create = () => {
    let r: Roster = { ...base, name: name.trim() || `${cat.data.name} Army` };
    const s = sizes.find((x) => x.id === size);
    if (s) r = chooseInGroup(cat, r, s.bs!.uid, s.g, s.opt);
    store.put(r);
    go(`army/${r.id}/settings/new`, true);
  };
  return (
    <>
      <AppBar title="New Army" sub={cat.data.name} onBack={onBack} />
      <main className="screen pad">
        <div className="field">
          <label htmlFor="army-name">Army name</label>
          <input id="army-name" className="input" value={name} placeholder={`${cat.data.name} Army`} onChange={(e) => setName(e.target.value)} autoComplete="off" />
        </div>
        <div className="field">
          <label>Battle size</label>
          <div className="opt-card" style={{ margin: 0 }}>
            {sizes.map((s) => (
              <button key={s.id} className={`opt ${size === s.id ? 'on' : ''}`} onClick={() => setSize(s.id)}>
                <span className="radio" />
                <span className="label"><span className="n">{s.label}</span></span>
              </button>
            ))}
          </div>
        </div>
        <p className="muted" style={{ fontSize: 14 }}>Next you'll pick your detachments and force disposition.</p>
      </main>
      <div className="bottom-bar">
        <button className="btn primary block" onClick={create}>Create Army</button>
      </div>
    </>
  );
}

export function ImportScreen({ code }: { code?: string }) {
  const [text, setText] = useState(code ?? '');
  const [preview, setPreview] = useState<Roster | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    setErr('');
    setPreview(null);
    if (!text.trim()) return;
    fromShareCode(text).then(setPreview, () => setErr('That does not look like a valid army code or link.'));
  }, [text]);
  return (
    <>
      <AppBar title="Import Army" onBack="" />
      <main className="screen pad">
        <div className="field">
          <label htmlFor="code">Army code or share link</label>
          <textarea id="code" className="input" style={{ minHeight: 120 }} value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste a share link or code here" />
        </div>
        {err && <p style={{ color: 'var(--danger)' }}>{err}</p>}
        {preview && (
          <p>
            Ready to import <b>{preview.name}</b>.
          </p>
        )}
      </main>
      <div className="bottom-bar">
        <button className="btn block" onClick={() => back('')}>Cancel</button>
        <button
          className="btn primary block"
          disabled={!preview}
          onClick={() => {
            store.put(preview!);
            toast('Army imported');
            go(`army/${preview!.id}`, true);
          }}
        >
          Import
        </button>
      </div>
    </>
  );
}
