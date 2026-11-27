#!/usr/bin/env node
// Builds the app's data files from the sources fetched by fetch-sources.sh.
//
//   BSData (BattleScribe JSON, 11th edition)  -> list building data (pruned)
//   Wahapedia CSV export                      -> detachment rules, stratagems, faction rules
//
// Output: public/data/index.json and public/data/<faction>.json
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SRC = path.join(root, '.sources');
const BS = path.join(SRC, 'bsdata');
const WAHA = path.join(SRC, 'wahapedia', 'wh40k-11e');
const OUT = path.join(root, 'public', 'data');
const factions = JSON.parse(fs.readFileSync(path.join(root, 'scripts', 'factions.json'), 'utf8'));

const readJson = (f) => JSON.parse(fs.readFileSync(path.join(BS, f), 'utf8'));
const gitHead = (dir) => {
  try {
    return execSync('git log -1 --format=%H%x20%cI', { cwd: dir }).toString().trim();
  } catch {
    return 'unknown';
  }
};

// ---------------------------------------------------------------- pruning
// Crusade / Boarding Actions / narrative content is not needed for matched play list building.
const PRUNE_NAME =
  /^(Codex )?(Battle Scars|Battle Traits|Crusade.*|Weapon Modifications|Magisterium.*|Endeavour.*|Mighty Champions|.*Battle Honours|.*Blackstone.*|Boarding Act.*|Breaching Operation.*|Armageddon Battle Traits|Order of Battle|Experience Points|Legendary Veterans|Totemic Presence upgrade|Damned Souls|Weapon Upgrades)$/;
const DROP_KEYS = new Set([
  'publicationId', 'page', 'comment', 'readme', 'publications', 'authorName', 'authorContact',
  'authorUrl', 'publisherUrl', 'battleScribeVersion', 'xmlns', 'childName', 'sortIndex_',
]);

function collectPrunedIds(doc, keepCost, ids) {
  const visit = (o) => {
    if (Array.isArray(o)) return o.forEach(visit);
    if (!o || typeof o !== 'object') return;
    if (o.id && o.name && PRUNE_NAME.test(o.name) && (o.type === undefined || o.type === 'upgrade' || o.type === 'selectionEntryGroup')) {
      ids.add(o.id);
    }
    Object.values(o).forEach(visit);
  };
  visit(doc);
}

function prune(o, ctx) {
  if (Array.isArray(o)) {
    return o.map((x) => prune(x, ctx)).filter((x) => x !== undefined);
  }
  if (!o || typeof o !== 'object') return o;
  if (o.id && ctx.prunedIds.has(o.id)) return undefined;
  if (o.targetId && ctx.prunedIds.has(o.targetId) && (o.type === 'selectionEntry' || o.type === 'selectionEntryGroup')) return undefined;
  if (o.comment && /crusade/i.test(o.comment) && (o.modifiers || o.type === 'and' || o.type === 'or')) return undefined;
  // costs / constraints / modifiers that only concern dropped cost types
  if (o.typeId && ctx.dropCost.has(o.typeId) && 'value' in o && o.name) return undefined; // cost
  if (o.field && ctx.dropCost.has(o.field)) return undefined; // constraint or modifier
  const out = {};
  for (const [k, v] of Object.entries(o)) {
    if (DROP_KEYS.has(k)) continue;
    if (k === 'forceEntries') {
      out[k] = prune(v.filter((f) => f.name === 'Army Roster'), ctx);
      continue;
    }
    const pv = prune(v, ctx);
    if (pv === undefined) continue;
    if (Array.isArray(pv) && pv.length === 0) continue;
    if (k === 'hidden' && pv === false) continue;
    out[k] = pv;
  }
  return out;
}

// ---------------------------------------------------------------- wahapedia csv
function readCsv(name) {
  const text = fs.readFileSync(path.join(WAHA, name), 'utf8').replace(/^﻿/, '');
  const tokens = text.split('|');
  // header row: N names, the token after the last name starts with "\n"
  let n = 0;
  while (!/^\r?\n/.test(tokens[n])) n++;
  const header = tokens.slice(0, n);
  const rows = [];
  let i = n;
  while (i + n <= tokens.length) {
    const fields = tokens.slice(i, i + n);
    fields[0] = fields[0].replace(/^\r?\n/, '');
    if (fields.length < n) break;
    const row = {};
    header.forEach((h, j) => (row[h] = fields[j]));
    rows.push(row);
    i += n;
  }
  return rows;
}

const norm = (s) => s.toLowerCase().replace(/[’'`]/g, '').replace(/[^a-z0-9]/g, '');

function cleanHtml(html) {
  return (html || '')
    .replace(/<a [^>]*>(.*?)<\/a>/g, '$1')
    .replace(/\sstyle="[^"]*"/g, '')
    .replace(/<img[^>]*>/g, '')
    .trim();
}

// ---------------------------------------------------------------- build
fs.mkdirSync(OUT, { recursive: true });
const gstRaw = readJson('Warhammer 40,000.json').gameSystem;
const keepCostNames = new Set(['pts', 'Detachment Points', 'Enhancements']);
const dropCost = new Set(gstRaw.costTypes.filter((c) => !keepCostNames.has(c.name)).map((c) => c.id));

const allFiles = fs.readdirSync(BS).filter((f) => f.endsWith('.json') && f !== 'Warhammer 40,000.json');
const catById = new Map();
for (const f of allFiles) {
  const c = readJson(f).catalogue;
  if (c) catById.set(c.id, { file: f, cat: c });
}

const strat = readCsv('Stratagems.csv');
const detAbil = readCsv('Detachment_abilities.csv');
const enh = readCsv('Enhancements.csv');
const abil = readCsv('Abilities.csv');
const lastUpdate = readCsv('Last_update.csv')[0]?.last_update;
const ws = {
  datasheets: readCsv('Datasheets.csv'),
  models: readCsv('Datasheets_models.csv'),
  wargear: readCsv('Datasheets_wargear.csv'),
  dsAbilities: readCsv('Datasheets_abilities.csv'),
  keywords: readCsv('Datasheets_keywords.csv'),
  composition: readCsv('Datasheets_unit_composition.csv'),
  options: readCsv('Datasheets_options.csv'),
  costs: readCsv('Datasheets_models_cost.csv'),
  leaders: readCsv('Datasheets_leader.csv'),
};

const index = {
  generatedAt: new Date().toISOString(),
  sources: {
    bsdata: { repo: 'BSData wh40k-11e (via mirror)', commit: gitHead(BS) },
    wahapedia: { note: 'Powered by Wahapedia (https://wahapedia.ru)', lastUpdate },
  },
  factions: [],
};

// prune once over everything so catalogue files can be shared between factions
const prunedIds = new Set();
collectPrunedIds(gstRaw, keepCostNames, prunedIds);
for (const { cat } of catById.values()) collectPrunedIds(cat, keepCostNames, prunedIds);
const ctx = { prunedIds, dropCost };

// clean previous output
for (const f of fs.readdirSync(OUT)) if (f.endsWith('.json')) fs.rmSync(path.join(OUT, f));
fs.rmSync(path.join(OUT, 'cat'), { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, 'cat'), { recursive: true });

const sizeOf = (f) => fs.statSync(path.join(OUT, f)).size;
fs.writeFileSync(path.join(OUT, 'gst.json'), JSON.stringify(prune(gstRaw, ctx)));
const catFiles = new Map();
const slug = (s) => s.toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
function writeCat(c) {
  if (!catFiles.has(c.id)) {
    const file = `cat/${slug(c.name)}.json`;
    fs.writeFileSync(path.join(OUT, file), JSON.stringify(prune(c, ctx)));
    catFiles.set(c.id, file);
  }
  return catFiles.get(c.id);
}

for (const fac of factions) {
  const primary = readJson(fac.catalogue).catalogue;
  // primary + linked catalogues (recursively)
  const cats = [];
  const seen = new Set();
  const addCat = (c) => {
    if (seen.has(c.id)) return;
    seen.add(c.id);
    cats.push(c);
    for (const l of c.catalogueLinks || []) {
      const t = catById.get(l.targetId);
      if (t) addCat(t.cat);
      else console.warn(`  ! missing linked catalogue ${l.name}`);
    }
  };
  addCat(primary);
  const catalogueFiles = cats.map(writeCat);

  // ---- wahapedia rules for this faction
  const fids = new Set([].concat(fac.wahapediaFaction));
  const fidOk = (id) => fids.has(id);
  const detachments = {};
  const det = (name) => (detachments[norm(name)] ??= { name, rules: [], stratagems: [], enhancements: [] });
  for (const r of detAbil.filter((r) => fidOk(r.faction_id))) {
    det(r.detachment).rules.push({ name: r.name, legend: r.legend, html: cleanHtml(r.description) });
  }
  for (const r of strat.filter((r) => fidOk(r.faction_id) && r.detachment)) {
    det(r.detachment).stratagems.push({
      name: r.name, type: r.type, cp: r.cp_cost, turn: r.turn, phase: r.phase,
      legend: r.legend, html: cleanHtml(r.description),
    });
  }
  for (const r of enh.filter((r) => fidOk(r.faction_id) && r.detachment)) {
    det(r.detachment).enhancements.push({ name: r.name, cost: r.cost, legend: r.legend, html: cleanHtml(r.description) });
  }
  const coreStratagems = strat
    .filter((r) => !r.faction_id && !r.detachment && /^Core/.test(r.type))
    .map((r) => ({ name: r.name, type: r.type, cp: r.cp_cost, turn: r.turn, phase: r.phase, legend: r.legend, html: cleanHtml(r.description) }));
  const factionRules = abil
    .filter((r) => fidOk(r.faction_id))
    .map((r) => ({ name: r.name, legend: r.legend, html: cleanHtml(r.description) }));

  // ---- wahapedia datasheets (for the datasheet viewer)
  const own = ws.datasheets.filter((d) => fidOk(d.faction_id) && d.virtual !== 'true');
  // allied units (Knights, Titans, Agents, Daemons...) that this army can take: match by name in other factions
  const unitNames = new Set();
  const collectNames = (o) => {
    if (Array.isArray(o)) return o.forEach(collectNames);
    if (!o || typeof o !== 'object') return;
    if ((o.type === 'unit' || o.type === 'model') && o.name) unitNames.add(norm(o.name.replace(/\[Legends\]/g, '')));
    Object.values(o).forEach(collectNames);
  };
  cats.forEach((c) => collectNames([c.sharedSelectionEntries, c.selectionEntries]));
  const ownNames = new Set(own.map((d) => norm(d.name)));
  const allied = ws.datasheets.filter((d) => !fidOk(d.faction_id) && d.virtual !== 'true' && unitNames.has(norm(d.name)) && !ownNames.has(norm(d.name)));
  const sheets = [...own, ...allied.filter((d, i) => allied.findIndex((x) => norm(x.name) === norm(d.name)) === i)];
  const sheetIds = new Set(sheets.map((d) => d.id));
  const byDs = (rows) => {
    const m = new Map();
    for (const r of rows) {
      if (!sheetIds.has(r.datasheet_id)) continue;
      if (!m.has(r.datasheet_id)) m.set(r.datasheet_id, []);
      m.get(r.datasheet_id).push(r);
    }
    return m;
  };
  const models = byDs(ws.models), wargear = byDs(ws.wargear), dsAbil = byDs(ws.dsAbilities);
  const keywords = byDs(ws.keywords), comp = byDs(ws.composition), opts = byDs(ws.options), costs = byDs(ws.costs);
  const abilById = new Map(abil.map((a) => [a.id, a]));
  const nameById = new Map(ws.datasheets.map((d) => [d.id, d.name]));
  const datasheets = {};
  const sharedAbilities = {};
  for (const d of sheets) {
    const abilities = { core: [], faction: [], datasheet: [], wargear: [] };
    for (const a of dsAbil.get(d.id) || []) {
      const ref = a.ability_id ? abilById.get(a.ability_id) : null;
      const name = (a.name || ref?.name || '') + (a.parameter ? ` ${a.parameter}` : '');
      let entry;
      if (ref && !a.description) {
        sharedAbilities[ref.id] ??= { name: ref.name, html: cleanHtml(ref.description) };
        entry = { name, ref: ref.id };
      } else entry = { name, html: cleanHtml(a.description || '') };
      if (a.type === 'Core') abilities.core.push(entry);
      else if (a.type === 'Faction') abilities.faction.push(entry);
      else if (/Wargear/i.test(a.type)) abilities.wargear.push(entry);
      else abilities.datasheet.push({ ...entry, type: a.type, model: a.model });
    }
    datasheets[norm(d.name)] = {
      name: d.name,
      role: d.role,
      legend: d.legend,
      loadout: cleanHtml(d.loadout),
      transport: cleanHtml(d.transport),
      leaderHead: cleanHtml(d.leader_head),
      leaderFooter: cleanHtml(d.leader_footer),
      damagedW: d.damaged_w,
      damaged: cleanHtml(d.damaged_description),
      link: d.link,
      models: (models.get(d.id) || []).map((m) => ({
        name: m.name, M: m.M, T: m.T, Sv: m.Sv, inv: m.inv_sv, invDescr: m.inv_sv_descr, W: m.W, Ld: m.Ld, OC: m.OC, base: m.base_size,
      })),
      weapons: (wargear.get(d.id) || []).map((w) => ({
        name: w.name, kw: w.description, range: w.range, type: w.type, A: w.A, skill: w.BS_WS, S: w.S, AP: w.AP, D: w.D,
      })),
      abilities,
      keywords: (keywords.get(d.id) || []).filter((k) => k.is_faction_keyword !== 'true').map((k) => k.keyword),
      factionKeywords: (keywords.get(d.id) || []).filter((k) => k.is_faction_keyword === 'true').map((k) => k.keyword),
      composition: (comp.get(d.id) || []).map((c) => cleanHtml(c.description)),
      options: (opts.get(d.id) || []).map((o) => cleanHtml(o.description)),
      costs: (costs.get(d.id) || []).map((c) => ({ text: c.description, cost: c.cost })),
      leads: ws.leaders.filter((l) => l.leader_id === d.id).map((l) => nameById.get(l.attached_id)).filter(Boolean),
    };
  }

  const data = {
    key: fac.key,
    name: fac.name,
    primaryCatalogueId: primary.id,
    preferCatalogueIds: (fac.preferCatalogues || []).map((f) => readJson(f).catalogue.id),
    catalogueFiles,
    rules: { detachments, coreStratagems, factionRules },
    datasheets,
    abilities: sharedAbilities,
  };
  const file = `${fac.key}.json`;
  fs.writeFileSync(path.join(OUT, file), JSON.stringify(data));
  const size = sizeOf(file) + sizeOf('gst.json') + catalogueFiles.reduce((t, f) => t + sizeOf(f), 0);
  console.log(`${fac.name.padEnd(26)} ${(size / 1024).toFixed(0).padStart(5)} KB  ${Object.keys(detachments).length} det, ${Object.keys(datasheets).length} sheets, ${factionRules.length} rules  [${cats.map((c) => c.name).join(', ')}]`);
  index.factions.push({ key: fac.key, name: fac.name, alliance: fac.alliance, accent: fac.accent, file, size });
}
fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(index, null, 2));
