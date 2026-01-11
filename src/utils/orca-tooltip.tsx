const React = window.React as unknown as {
  createElement: typeof window.React.createElement;
};
const { createElement } = React;
const { Tooltip } = orca.components;

export function withTooltip(
  text: any,
  child: any,
  options?: Record<string, any>,
): any {
  if (text === undefined || text === null || text === "") return child;
  return createElement(Tooltip, { text, ...(options ?? {}) }, child);
}

export function tooltipText(text: string): any {
  return createElement("span", { style: { whiteSpace: "pre-wrap" } }, text);
}
