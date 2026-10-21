export interface ConvertedPitchClose {
  id: string;
  discovery_log_id: string | null;
  contract_value: number | null;
  updated_at?: string | null;
}

export interface ConvertedDiscoveryClose {
  id: string;
  contract_value: number | null;
  updated_at?: string | null;
}

export interface ConvertedDeal {
  key: string;
  source: "pitch_call" | "discovery_log";
  contractValue: number;
  updatedAt: string | null;
  discoveryLogId: string | null;
}

export interface ConvertedPitchWin extends ConvertedPitchClose {
  client_name: string | null;
  company_name: string | null;
}

export interface ConvertedDiscoveryWin extends ConvertedDiscoveryClose {
  client_name: string | null;
}

export interface UniqueRecentWin {
  id: string;
  companyName: string;
  clientName: string;
  contractValue: number;
  closedDate: string | null;
  source: "pitch_call" | "discovery_log";
  discoveryLogId: string | null;
}

const getTimestamp = (value: string | null | undefined) => {
  if (!value) return 0;

  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const getPitchDealKey = (pitch: { id: string; discovery_log_id: string | null }) =>
  pitch.discovery_log_id ?? `pitch:${pitch.id}`;

export function getUniqueConvertedDeals(
  pitchCloses: ConvertedPitchClose[] = [],
  discoveryCloses: ConvertedDiscoveryClose[] = [],
): ConvertedDeal[] {
  const pitchDeals = new Map<string, ConvertedDeal>();
  const pitchDiscoveryIds = new Set<string>();

  for (const pitch of pitchCloses) {
    const key = getPitchDealKey(pitch);

    if (pitch.discovery_log_id) {
      pitchDiscoveryIds.add(pitch.discovery_log_id);
    }

    const normalized: ConvertedDeal = {
      key,
      source: "pitch_call",
      contractValue: pitch.contract_value || 0,
      updatedAt: pitch.updated_at ?? null,
      discoveryLogId: pitch.discovery_log_id ?? null,
    };

    const existing = pitchDeals.get(key);
    if (!existing || getTimestamp(normalized.updatedAt) >= getTimestamp(existing.updatedAt)) {
      pitchDeals.set(key, normalized);
    }
  }

  const discoveryOnlyDeals = discoveryCloses
    .filter((log) => !pitchDiscoveryIds.has(log.id))
    .map<ConvertedDeal>((log) => ({
      key: `discovery:${log.id}`,
      source: "discovery_log",
      contractValue: log.contract_value || 0,
      updatedAt: log.updated_at ?? null,
      discoveryLogId: log.id,
    }));

  return [...pitchDeals.values(), ...discoveryOnlyDeals];
}

export function getUniqueRecentWins(
  pitchWins: ConvertedPitchWin[] = [],
  discoveryWins: ConvertedDiscoveryWin[] = [],
): UniqueRecentWin[] {
  const pitchDeals = new Map<string, UniqueRecentWin>();
  const pitchDiscoveryIds = new Set<string>();

  for (const pitch of pitchWins) {
    const key = getPitchDealKey(pitch);

    if (pitch.discovery_log_id) {
      pitchDiscoveryIds.add(pitch.discovery_log_id);
    }

    const normalized: UniqueRecentWin = {
      id: pitch.id,
      companyName: pitch.company_name || pitch.client_name || "Unknown",
      clientName: pitch.client_name || "Unknown",
      contractValue: pitch.contract_value || 0,
      closedDate: pitch.updated_at ?? null,
      source: "pitch_call",
      discoveryLogId: pitch.discovery_log_id ?? null,
    };

    const existing = pitchDeals.get(key);
    if (!existing || getTimestamp(normalized.closedDate) >= getTimestamp(existing.closedDate)) {
      pitchDeals.set(key, normalized);
    }
  }

  const discoveryOnlyDeals = discoveryWins
    .filter((log) => !pitchDiscoveryIds.has(log.id))
    .map<UniqueRecentWin>((log) => ({
      id: log.id,
      companyName: log.client_name || "Unknown",
      clientName: log.client_name || "Unknown",
      contractValue: log.contract_value || 0,
      closedDate: log.updated_at ?? null,
      source: "discovery_log",
      discoveryLogId: log.id,
    }));

  return [...pitchDeals.values(), ...discoveryOnlyDeals].sort(
    (a, b) => getTimestamp(b.closedDate) - getTimestamp(a.closedDate),
  );
}

export function sumConvertedDealValue<T extends { contractValue: number }>(deals: T[]) {
  return deals.reduce((sum, deal) => sum + deal.contractValue, 0);
}
