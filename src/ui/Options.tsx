import type { State, Option, RNode } from '../engine/state';
import type { Roster } from '../engine/types';
import { addSelection, chooseInGroup, removeSelection, setCount, splitSelection } from '../engine/ops';
import { useEffect, useState } from 'react';
import { vibrate } from '../lib';
import { IconSplit } from './icons';

interface Ctx {
  st: State;
  roster: Roster;
  update: (r: Roster) => void;
}

const visible = (o: Option) => !o.hidden || o.count > 0;
const costLabel = (o: Option) => (o.dp ? `${o.dp} DP` : o.cost ? `+${o.cost} pts` : '');

/** Renders the configurable options under a selection as cards (top level) */
export function OptionCards({ ctx, node, skip }: { ctx: Ctx; node: RNode; skip?: (o: Option) => boolean }) {
  const opts = ctx.st.options(node).filter(visible).filter((o) => !skip?.(o));
  // loose entries go in one card, each group in its own card
  const loose = opts.filter((o) => o.def.kind === 'entry');
  const groups = opts.filter((o) => o.def.kind === 'group');
  return (
    <>
      {loose.length > 0 && (
        <div className="opt-card">
          <h3>Options</h3>
          {loose.map((o) => <Entry key={o.def.id} ctx={ctx} parent={node} o={o} />)}
        </div>
      )}
      {groups.map((g) => (
        <div className="opt-card" key={g.def.id}>
          <h3>
            {g.name}
            <span className="hint">{groupHint(g)}</span>
          </h3>
          <Group ctx={ctx} parent={node} g={g} />
        </div>
      ))}
    </>
  );
}

function groupHint(g: Option) {
  if (g.max === 1 && g.min === 1) return 'Choose 1';
  if (g.max === 1) return 'Choose up to 1';
  if (g.max > 0 && g.min > 0) return `${g.min}–${g.max}`;
  if (g.max > 0) return `Up to ${g.max}`;
  if (g.min > 0) return `At least ${g.min}`;
  return '';
}

/** Options nested under an existing selection, shown inline */
function Nested({ ctx, node }: { ctx: Ctx; node: RNode }) {
  const opts = ctx.st.options(node).filter(visible);
  if (!opts.length) return null;
  return (
    <div className="nest">
      {opts.map((o) =>
        o.def.kind === 'group' ? (
          <div key={o.def.id}>
            {o.name !== ctx.st.name(node) && <div className="group-h">{o.name} <span className="muted">{groupHint(o)}</span></div>}
            <Group ctx={ctx} parent={node} g={o} />
          </div>
        ) : (
          <Entry key={o.def.id} ctx={ctx} parent={node} o={o} />
        ),
      )}
    </div>
  );
}

function flattenEntries(opts: Option[], heading?: string): { o: Option; heading?: string }[] {
  const out: { o: Option; heading?: string }[] = [];
  for (const o of opts.filter(visible)) {
    if (o.def.kind === 'group') out.push(...flattenEntries(o.children ?? [], o.name));
    else out.push({ o, heading });
  }
  return out;
}

function Group({ ctx, parent, g }: { ctx: Ctx; parent: RNode; g: Option }) {
  const children = (g.children ?? []).filter(visible);
  const flat = flattenEntries(children);
  const radio = g.max === 1 && flat.length > 0;
  if (radio) {
    const headings = new Set(flat.map((f) => f.heading));
    let last: string | undefined;
    return (
      <>
        {flat.map(({ o: c, heading }) => {
          const on = c.count > 0;
          const choose = () => {
            vibrate();
            if (on) {
              if (g.min === 0) ctx.update(chooseInGroup(ctx.st.cat, ctx.roster, parent.uid, g, null));
              return;
            }
            ctx.update(chooseInGroup(ctx.st.cat, ctx.roster, parent.uid, g, c));
          };
          const showHead = heading && heading !== last && (headings.size > 1 || heading !== g.name);
          last = heading;
          return (
            <div key={c.def.id}>
              {showHead && <div className="subhead">{heading}</div>}
              <button className={`opt ${on ? 'on' : ''} ${c.hidden ? 'disabled' : ''}`} onClick={choose} aria-pressed={on}>
                <span className="radio" />
                <span className="label">
                  <span className="n">{c.name}</span>
                </span>
                <span className="cost">{costLabel(c)}</span>
              </button>
              {on && c.nodes.map((n) => <Nested key={n.uid} ctx={ctx} node={n} />)}
            </div>
          );
        })}
      </>
    );
  }
  return (
    <>
      {children.map((c) =>
        c.def.kind === 'group' ? (
          <div key={c.def.id}>
            <div className="group-h" style={{ padding: '10px 14px 2px' }}>
              {c.name} <span className="muted">{groupHint(c)}</span>
            </div>
            <Group ctx={ctx} parent={parent} g={c} />
          </div>
        ) : (
          <Entry key={c.def.id} ctx={ctx} parent={parent} o={c} groupTotal={g.count} groupMax={g.max} />
        ),
      )}
    </>
  );
}

function Entry({ ctx, parent, o, groupTotal, groupMax }: { ctx: Ctx; parent: RNode; o: Option; groupTotal?: number; groupMax?: number }) {
  const { st, roster, update } = ctx;
  const add = (n = 1) => {
    vibrate();
    update(addSelection(st.cat, roster, parent.uid, o.def, o.gs, n).roster);
  };
  const groupFull = groupMax !== undefined && groupMax >= 0 && (groupTotal ?? 0) >= groupMax;
  const atMax = (o.max >= 0 && o.count >= o.max) || groupFull;

  // large numeric values (manual points limit): type it in, or step in 25s
  if (/^points limit$/i.test(o.name.trim()) && o.max !== 1 && o.nodes.length) {
    return <NumberEntry ctx={ctx} o={o} step={25} />;
  }

  // single toggle
  if (o.max === 1 && o.def.type !== 'model') {
    const on = o.count > 0;
    return (
      <div>
        <button
          className={`opt ${on ? 'on' : ''} ${(!on && atMax) || o.hidden ? 'disabled' : ''}`}
          aria-pressed={on}
          onClick={() => {
            if (on) {
              if (o.min > 0) return;
              vibrate();
              update(removeSelection(roster, o.nodes[0].uid));
            } else if (!atMax) add();
          }}
        >
          <span className="check" />
          <span className="label">
            <span className="n">{o.name}</span>
          </span>
          <span className="cost">{costLabel(o)}</span>
        </button>
        {on && o.nodes.map((n) => <Nested key={n.uid} ctx={ctx} node={n} />)}
      </div>
    );
  }

  // fixed count (e.g. "3x Custodian Guard")
  const fixed = o.min > 0 && o.min === o.max;
  if (!o.nodes.length) {
    return (
      <div className={`opt ${atMax ? 'disabled' : ''}`}>
        <span className="label">
          <span className="n">{o.name}</span>
          {o.max > 1 && <span className="c"> (max {o.max})</span>}
        </span>
        <span className="cost">{costLabel(o)}</span>
        <div className="stepper">
          <button disabled aria-label="Remove">−</button>
          <span className="v">0</span>
          <button disabled={atMax} onClick={() => add()} aria-label="Add">+</button>
        </div>
      </div>
    );
  }
  return (
    <>
      {o.nodes.map((n) => {
        const canDec = o.count > o.min;
        const canInc = !atMax;
        const hasChildren = st.options(n).some(visible);
        return (
          <div key={n.uid}>
            <div className="opt">
              <span className="label">
                <span className="n">
                  {n.n}× {st.name(n)}
                </span>
                {o.max > 1 && !fixed && (
                  <span className="c">
                    {' '}
                    ({o.min}–{o.max})
                  </span>
                )}
              </span>
              <span className="cost">{o.cost ? `${o.cost * n.n} pts` : ''}</span>
              {hasChildren && n.n > 1 && o.nodes.length < 12 && (
                <button className="mini-btn" onClick={() => update(splitSelection(roster, n.uid))} title="Split one model off to give it different wargear" aria-label="Split">
                  <IconSplit />
                </button>
              )}
              {!fixed && (
                <div className="stepper">
                  <button disabled={!canDec} onClick={() => { vibrate(); update(setCount(roster, n.uid, n.n - 1)); }} aria-label="Remove one">−</button>
                  <span className="v">{n.n}</span>
                  <button disabled={!canInc} onClick={() => { vibrate(); update(setCount(roster, n.uid, n.n + 1)); }} aria-label="Add one">+</button>
                </div>
              )}
            </div>
            <Nested ctx={ctx} node={n} />
          </div>
        );
      })}
    </>
  );
}

function NumberEntry({ ctx, o, step }: { ctx: Ctx; o: Option; step: number }) {
  const node = o.nodes[0];
  const [text, setText] = useState(String(node.n));
  useEffect(() => setText(String(node.n)), [node.n]);
  const min = Math.max(o.min, step);
  const commit = (v: number) => {
    const n = Math.max(min, Math.round(Number.isFinite(v) ? v : node.n));
    setText(String(n));
    if (n !== node.n) ctx.update(setCount(ctx.roster, node.uid, n));
  };
  return (
    <div className="opt">
      <span className="label">
        <span className="n">{o.name}</span>
        <span className="c"> (min {min})</span>
      </span>
      <div className="stepper">
        <button disabled={node.n - step < min} onClick={() => { vibrate(); commit(node.n - step); }} aria-label={`Decrease by ${step}`}>−</button>
        <input
          className="num-input"
          type="number"
          inputMode="numeric"
          step={step}
          min={min}
          value={text}
          aria-label={o.name}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => commit(Number(text))}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
        <button onClick={() => { vibrate(); commit(node.n + step); }} aria-label={`Increase by ${step}`}>+</button>
      </div>
    </div>
  );
}
