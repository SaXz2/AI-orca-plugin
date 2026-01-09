export type WebSearchSource = {
  title: string;
  url: string;
  snippet?: string;
  publishedDate?: string;
  domain?: string;
};

export type SourceGroup = {
  id: string;
  label: string;
  sources: WebSearchSource[];
};

function extractDomain(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function normalizeWebSearchResults(results: any[]): WebSearchSource[] {
  if (!Array.isArray(results)) return [];
  const seen = new Set<string>();
  const normalized: WebSearchSource[] = [];

  results.forEach((result) => {
    if (!result || typeof result.url !== "string") return;
    const url = result.url.trim();
    if (!url || seen.has(url)) return;
    seen.add(url);
    normalized.push({
      title: String(result.title || result.url || "Source").trim(),
      url,
      snippet: (result.snippet || result.content || "").toString().trim() || undefined,
      publishedDate: result.publishedDate ? String(result.publishedDate) : undefined,
      domain: result.domain ? String(result.domain) : extractDomain(url),
    });
  });

  return normalized;
}

export function groupSourcesByDomain(sources: WebSearchSource[]): SourceGroup[] {
  if (!sources.length) return [];
  const groups = new Map<string, WebSearchSource[]>();

  sources.forEach((source) => {
    const label = source.domain || source.title || "Source";
    const key = label.toLowerCase();
    const list = groups.get(key) || [];
    list.push(source);
    groups.set(key, list);
  });

  return Array.from(groups.entries()).map(([key, list], index) => {
    const baseLabel = list[0]?.domain || list[0]?.title || "Source";
    const extraCount = list.length > 1 ? ` +${list.length - 1}` : "";
    return {
      id: `source-group-${index}-${key.replace(/[^a-z0-9]+/g, "-")}`,
      label: `${baseLabel}${extraCount}`,
      sources: list,
    };
  });
}
