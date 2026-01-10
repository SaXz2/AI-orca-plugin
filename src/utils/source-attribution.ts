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

const DOMAIN_LABEL_MAP: Record<string, string> = {
  "wikipedia.org": "Wikipedia",
  "zh.wikipedia.org": "维基百科",
  "baike.baidu.com": "百度百科",
  "zhihu.com": "知乎",
  "zhuanlan.zhihu.com": "知乎专栏",
  "bilibili.com": "哔哩哔哩",
  "youtube.com": "YouTube",
  "youtu.be": "YouTube",
  "weibo.com": "微博",
  "tieba.baidu.com": "百度贴吧",
  "fandom.com": "Fandom",
  "github.com": "GitHub",
  "nobelprize.org": "NobelPrize.org",
};

function extractDomain(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function getRootDomain(domain: string): string {
  const parts = domain.split(".").filter(Boolean);
  if (parts.length <= 2) return domain;
  const tld = parts[parts.length - 1];
  const sld = parts[parts.length - 2];
  const third = parts[parts.length - 3];
  const twoLevelTlds = new Set([
    "com.cn",
    "org.cn",
    "net.cn",
    "gov.cn",
    "co.uk",
    "ac.uk",
    "co.jp",
    "com.au",
    "com.hk",
  ]);
  const lastTwo = `${sld}.${tld}`;
  if (twoLevelTlds.has(lastTwo) && third) {
    return `${third}.${lastTwo}`;
  }
  return lastTwo;
}

function formatDomainLabel(domain: string): string {
  const lower = domain.toLowerCase();
  if (DOMAIN_LABEL_MAP[lower]) return DOMAIN_LABEL_MAP[lower];
  const root = getRootDomain(lower);
  if (DOMAIN_LABEL_MAP[root]) return DOMAIN_LABEL_MAP[root];
  const parts = root.split(".");
  if (parts.length < 2) return root;
  const name = parts[0];
  const tld = parts.slice(1).join(".");
  const prettyName = name
    .split("-")
    .map((segment) => {
      if (!segment) return "";
      if (segment.length <= 3) return segment.toUpperCase();
      return segment.charAt(0).toUpperCase() + segment.slice(1);
    })
    .join("");
  return `${prettyName}.${tld}`;
}

function extractSiteLabelFromTitle(title: string | undefined): string | null {
  if (!title) return null;
  const trimmed = title.trim();
  if (!trimmed) return null;
  const separators = [" - ", " | ", " — ", " – ", " · ", " • ", " _ "];
  for (const sep of separators) {
    const index = trimmed.lastIndexOf(sep);
    if (index > 0 && index + sep.length < trimmed.length) {
      const candidate = trimmed.slice(index + sep.length).trim();
      if (candidate && candidate.length <= 24) {
        return candidate;
      }
    }
  }
  return null;
}

function getSourceLabel(source: WebSearchSource): string {
  const titleLabel = extractSiteLabelFromTitle(source.title);
  if (titleLabel) return titleLabel;
  const domain = source.domain || extractDomain(source.url);
  if (domain) return formatDomainLabel(domain);
  return source.title || "Source";
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
    const domain = source.domain || extractDomain(source.url);
    const label = domain || source.title || "Source";
    const key = label.toLowerCase();
    const list = groups.get(key) || [];
    list.push(source);
    groups.set(key, list);
  });

  return Array.from(groups.entries()).map(([key, list], index) => {
    const baseLabel = list[0] ? getSourceLabel(list[0]) : "Source";
    const extraCount = list.length > 1 ? ` +${list.length - 1}` : "";
    return {
      id: `source-group-${index}-${key.replace(/[^a-z0-9]+/g, "-")}`,
      label: `${baseLabel}${extraCount}`,
      sources: list,
    };
  });
}
