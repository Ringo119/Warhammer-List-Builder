/* eslint-disable @typescript-eslint/no-explicit-any */
export type BsNode = any;

/** A selection in a roster (stored). Child numbers are per instance of the parent. */
export interface Sel {
  uid: string;
  /** id of the option definition (entry link id or entry id) */
  id: string;
  /** number of this selection (per parent instance) */
  n: number;
  /** ids of the groups this selection was made through (innermost last) */
  gs?: string[];
  ch: Sel[];
  /** association id -> target selection uids (e.g. a Leader leading a bodyguard unit) */
  assoc?: Record<string, string[]>;
}

export interface Roster {
  id: string;
  name: string;
  faction: string;
  sels: Sel[];
  created: number;
  updated: number;
  notes?: string;
}

export interface FactionData {
  key: string;
  name: string;
  primaryCatalogueId: string;
  /** linked catalogues whose army options take precedence (e.g. Space Marines for chapters) */
  preferCatalogueIds?: string[];
  gameSystem: BsNode;
  catalogues: BsNode[];
  rules: {
    detachments: Record<string, DetachmentRules>;
    coreStratagems: Stratagem[];
    factionRules: { name: string; legend: string; html: string }[];
  };
  datasheets: Record<string, WahaDatasheet>;
  abilities: Record<string, { name: string; html: string }>;
}

export interface Stratagem {
  name: string;
  type: string;
  cp: string;
  turn: string;
  phase: string;
  legend: string;
  html: string;
}

export interface DetachmentRules {
  name: string;
  rules: { name: string; legend: string; html: string }[];
  stratagems: Stratagem[];
  enhancements: { name: string; cost: string; legend: string; html: string }[];
}

export interface WahaDatasheet {
  name: string;
  role: string;
  legend: string;
  loadout: string;
  transport: string;
  leaderHead: string;
  leaderFooter: string;
  damagedW: string;
  damaged: string;
  link: string;
  models: { name: string; M: string; T: string; Sv: string; inv: string; invDescr: string; W: string; Ld: string; OC: string; base: string }[];
  weapons: { name: string; kw: string; range: string; type: string; A: string; skill: string; S: string; AP: string; D: string }[];
  abilities: {
    core: AbilityRef[];
    faction: AbilityRef[];
    datasheet: (AbilityRef & { type?: string; model?: string })[];
    wargear: AbilityRef[];
  };
  keywords: string[];
  factionKeywords: string[];
  composition: string[];
  options: string[];
  costs: { text: string; cost: string }[];
  leads: string[];
}

export interface AbilityRef {
  name: string;
  html?: string;
  ref?: string;
}

export interface Message {
  level: 'error' | 'warning' | 'info';
  text: string;
  uid?: string;
}
