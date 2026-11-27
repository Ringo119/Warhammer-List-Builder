import fs from 'node:fs';
import { Catalog } from '../catalog';
import type { FactionData } from '../types';

const dir = 'public/data/';
const read = (f: string) => JSON.parse(fs.readFileSync(dir + f, 'utf8'));
const gst = read('gst.json');

export function loadFaction(key: string): Catalog {
  const fac = read(`${key}.json`);
  return new Catalog({ ...fac, gameSystem: gst, catalogues: fac.catalogueFiles.map(read) } as FactionData);
}

export function factionKeys(): string[] {
  return read('index.json').factions.map((f: { key: string }) => f.key);
}
