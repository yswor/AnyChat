import { create } from "zustand";
import type { Provider, BalanceInfo } from "../types";
import { PROVIDER_TEMPLATES } from "../types";
import Database from "@tauri-apps/plugin-sql";
import { invoke } from "@tauri-apps/api/core";

interface ProviderState {
  providers: Provider[];
  activeProviderId: string | null;
  loading: boolean;
  balances: Record<string, { data: BalanceInfo | null; loading: boolean; error: string | null }>;
  setProviders: (providers: Provider[]) => void;
  setActiveProvider: (id: string | null) => void;
  addProvider: (provider: Provider) => void;
  updateProvider: (id: string, data: Partial<Provider>) => void;
  removeProvider: (id: string) => void;
  getActiveProvider: () => Provider | undefined;
  loadProviders: () => Promise<void>;
  fetchBalance: (providerId: string) => Promise<void>;
}

let providerDb: Database | null = null;

async function getProviderDb(): Promise<Database> {
  if (!providerDb) {
    providerDb = await Database.load("sqlite:anychat.db");
  }
  return providerDb;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeProvider(row: any): Provider {
  let models: string[] = [];
  try {
    models = typeof row.models === "string" ? JSON.parse(row.models) : row.models;
  } catch {
    models = [];
  }

  let thinkingParam: Provider["thinking_param"];
  try {
    thinkingParam = row.thinking_param
      ? typeof row.thinking_param === "string"
        ? JSON.parse(row.thinking_param)
        : row.thinking_param
      : undefined;
  } catch {
    thinkingParam = undefined;
  }

  return {
    id: row.id,
    name: row.name,
    base_url: row.base_url,
    api_key: row.api_key ?? "",
    models: models || [],
    default_model: row.default_model ?? undefined,
    supports_thinking: Boolean(row.supports_thinking),
    thinking_param: thinkingParam,
    balance_path: deriveBalancePath(row.base_url),
    reasoning_effort_options: deriveEffortOptions(row.base_url),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function deriveBalancePath(base_url: string): string | undefined {
  for (const tpl of Object.values(PROVIDER_TEMPLATES)) {
    if (tpl.balance_path && base_url?.startsWith(tpl.base_url)) {
      return tpl.balance_path;
    }
  }
  return undefined;
}

function deriveEffortOptions(base_url: string): string[] | undefined {
  for (const tpl of Object.values(PROVIDER_TEMPLATES)) {
    if (tpl.reasoning_effort_options && base_url?.startsWith(tpl.base_url)) {
      return tpl.reasoning_effort_options;
    }
  }
  return undefined;
}

export const useProviderStore = create<ProviderState>((set, get) => ({
  providers: [],
  activeProviderId: localStorage.getItem("activeProviderId") || null,
  loading: false,
  balances: {},

  setProviders: (providers) => set({ providers }),

  setActiveProvider: (id) => {
    localStorage.setItem("activeProviderId", id ?? "");
    set({ activeProviderId: id });
  },

  addProvider: (provider) =>
    set((state) => ({ providers: [...state.providers, provider] })),

  updateProvider: (id, data) =>
    set((state) => ({
      providers: state.providers.map((p) =>
        p.id === id ? { ...p, ...data } : p,
      ),
    })),

  removeProvider: (id) => {
    (async () => {
      try {
        const d = await getProviderDb();
        await d.execute("UPDATE conversations SET provider_id = NULL WHERE provider_id = $1", [id]);
        await d.execute("DELETE FROM providers WHERE id = $1", [id]);
      } catch { /* best effort */ }
    })();
    set((state) => ({
      providers: state.providers.filter((p) => p.id !== id),
      activeProviderId:
        state.activeProviderId === id ? null : state.activeProviderId,
    }));
  },

  getActiveProvider: () => {
    const { providers, activeProviderId } = get();
    return providers.find((p) => p.id === activeProviderId);
  },

  loadProviders: async () => {
    const d = await getProviderDb();
    set({ loading: true });
    try {
      const rows: unknown[] = await d.select(
        "SELECT * FROM providers ORDER BY created_at DESC",
      );
      const providers = rows.map((r) => normalizeProvider(r));
      // 如果有供应商但没有设置活跃供应商，自动设置第一个为活跃
      const state = get();
      if (providers.length > 0 && !state.activeProviderId) {
        const firstProvider = providers[0];
        localStorage.setItem("activeProviderId", firstProvider.id);
        set({ providers, activeProviderId: firstProvider.id, loading: false });
      } else {
        set({ providers, loading: false });
      }
    } catch {
      set({ loading: false });
    }
  },

  fetchBalance: async (providerId) => {
    const provider = get().providers.find((p) => p.id === providerId);
    if (!provider?.balance_path) return;

    set((s) => ({
      balances: {
        ...s.balances,
        [providerId]: { data: null, loading: true, error: null },
      },
    }));

    try {
      const response = await invoke<{ success: boolean; balance: BalanceInfo | null; error: string | null }>(
        "fetch_balance",
        {
          baseUrl: provider.base_url,
          balancePath: provider.balance_path,
          apiKey: provider.api_key,
        },
      );

      if (response.success && response.balance) {
        set((s) => ({
          balances: {
            ...s.balances,
            [providerId]: { data: response.balance, loading: false, error: null },
          },
        }));
      } else {
        set((s) => ({
          balances: {
            ...s.balances,
            [providerId]: { data: null, loading: false, error: response.error || "查询失败" },
          },
        }));
      }
    } catch (err) {
      set((s) => ({
        balances: {
          ...s.balances,
          [providerId]: { data: null, loading: false, error: String(err) },
        },
      }));
    }
  },
}));
