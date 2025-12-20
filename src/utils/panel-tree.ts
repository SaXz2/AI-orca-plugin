import type { ColumnPanel, RowPanel, ViewPanel } from "../orca.d.ts";

export function findViewPanelById(
  panels: RowPanel | ColumnPanel | ViewPanel,
  id: string,
): ViewPanel | null {
  if (panels.id === id && "view" in panels) return panels;
  if ("children" in panels) {
    for (const child of panels.children) {
      const found = findViewPanelById(child, id);
      if (found) return found;
    }
  }
  return null;
}

