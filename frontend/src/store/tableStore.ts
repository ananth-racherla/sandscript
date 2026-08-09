import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { makeTableBounds, type TableBounds } from '../lib/types';
import { wasm } from '../lib/wasmClient';
import { usePatternStore } from './patternStore';

interface TableState {
  width: number;
  height: number;
  grooveWidthMM: number;
  cornerRadiusMM: number;
  /** Derived from width/height — kept in the store so consumers don't
   * each recompute it, but width/height (not this) are the persisted
   * source of truth. */
  table: TableBounds;
  /** The one atomic "table size changed" action: pushes the new bounds to
   * WASM (which holds them in a module-level static — see src/gcode.rs)
   * and regenerates whatever pattern is currently active, in that order.
   * Never let a component independently useEffect off table dims to
   * regenerate — that's what risks a stale-generation race. */
  setDims: (width: number, height: number) => Promise<void>;
  setGrooveWidth: (mm: number) => void;
  setCornerRadius: (mm: number) => void;
  /** Called once after WASM finishes loading, to push whatever dims were
   * restored from localStorage (WASM's own state always starts fresh). */
  pushDimsToWasm: () => void;
}

export const useTableStore = create<TableState>()(
  persist(
    (set, get) => ({
      width: 515,
      height: 320,
      grooveWidthMM: 1,
      cornerRadiusMM: 0,
      table: makeTableBounds(515, 320),

      setDims: async (rawWidth, rawHeight) => {
        const width = Math.max(50, rawWidth || 515);
        const height = Math.max(50, rawHeight || 320);
        const table = makeTableBounds(width, height);
        set({ width, height, table });
        wasm.setTableSize(table.xMin, table.xMax, table.yMin, table.yMax);
        await usePatternStore.getState().regenerateActive?.();
      },

      setGrooveWidth: (mm) => set({ grooveWidthMM: Math.max(0.5, mm || 1) }),
      setCornerRadius: (mm) => set({ cornerRadiusMM: Math.max(0, mm || 0) }),

      pushDimsToWasm: () => {
        const { table } = get();
        wasm.setTableSize(table.xMin, table.xMax, table.yMin, table.yMax);
      },
    }),
    {
      name: 'sandscript-table',
      partialize: (s) => ({
        width: s.width,
        height: s.height,
        grooveWidthMM: s.grooveWidthMM,
        cornerRadiusMM: s.cornerRadiusMM,
      }),
      onRehydrateStorage: () => (state) => {
        // `table` isn't itself persisted (only width/height are) — rebuild
        // it once after localStorage hydration restores width/height.
        if (state) state.table = makeTableBounds(state.width, state.height);
      },
    },
  ),
);
