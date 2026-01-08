/**
 * InlineCitation Component
 * 内联引用标签，显示在文字旁边，标明来源网站
 * 类似ChatGPT的引用标注效果
 */

const React = window.React as unknown as {
  createElement: typeof window.React.createElement;
  useState: <T>(initial: T | (() => T)) => [T, (next: T | ((prev: T) => T)) => void];
  useCallback: <T extends (...args: any[]) => any>(fn: T, deps: any[]) => T;
  Fragment: typeof window.React.Fragment;
};
const { createElement, useState, useCallback } = React;

export interface InlineCitationData {
  index: number;      // 引用编号 (1, 2, 3...)
  title: string;      // 来源标题
  url: string;        // 来源URL
  domain: string;     // 域名显示 (如 "知乎专栏", "百度知道")
  snippet?: string;   // 摘要预览
}

interface InlineCitationProps {
  citation: InlineCitationData;
  showDomain?: boolean;  // 是否显示域名标签
  compact?: boolean;     // 紧凑模式（只显示数字）
}

// 域名到友好名称的映射
const domainNameMap: Record<string, string> = {
  "zhihu.com": "知乎",
  "zhuanlan.zhihu.com": "知乎专栏",
  "baidu.com": "百度",
  "zhidao.baidu.com": "百度知道",
  "baike.baidu.com": "百度百科",
  "bilibili.com": "B站",
  "weibo.com": "微博",
  "douban.com": "豆瓣",
  "jianshu.com": "简书",
  "csdn.net": "CSDN",
  "juejin.cn": "掘金",
  "github.com": "GitHub",
  "stackoverflow.com": "Stack Overflow",
  "wikipedia.org": "维基百科",
  "zh.wikipedia.org": "维基百科",
  "miyoushe.com": "米游社",
  "nga.cn": "NGA",
  "tieba.baidu.com": "贴吧",
  "xiaohongshu.com": "小红书",
  "toutiao.com": "头条",
  "36kr.com": "36氪",
  "sspai.com": "少数派",
  "v2ex.com": "V2EX",
  "segmentfault.com": "思否",
  "oschina.net": "开源中国",
  "infoq.cn": "InfoQ",
  "medium.com": "Medium",
  "dev.to": "DEV",
  "reddit.com": "Reddit",
  "twitter.com": "Twitter",
  "x.com": "X",
};

// 获取友好的域名显示名称
function getFriendlyDomainName(domain: string): string {
  // 先尝试完整匹配
  if (domainNameMap[domain]) {
    return domainNameMap[domain];
  }
  
  // 尝试去掉www后匹配
  const withoutWww = domain.replace(/^www\./, "");
  if (domainNameMap[withoutWww]) {
    return domainNameMap[withoutWww];
  }
  
  // 尝试匹配主域名
  const parts = withoutWww.split(".");
  if (parts.length >= 2) {
    const mainDomain = parts.slice(-2).join(".");
    if (domainNameMap[mainDomain]) {
      return domainNameMap[mainDomain];
    }
  }
  
  // 返回简化的域名
  return withoutWww.replace(/\.(com|cn|net|org|io|co)$/, "");
}

// 根据域名获取品牌颜色
function getDomainColor(domain: string): string {
  const colorMap: Record<string, string> = {
    "zhihu.com": "#0066FF",
    "zhuanlan.zhihu.com": "#0066FF",
    "baidu.com": "#2932E1",
    "zhidao.baidu.com": "#2932E1",
    "baike.baidu.com": "#2932E1",
    "bilibili.com": "#FB7299",
    "weibo.com": "#E6162D",
    "douban.com": "#007722",
    "github.com": "#24292F",
    "stackoverflow.com": "#F48024",
    "wikipedia.org": "#000000",
    "miyoushe.com": "#00C3FF",
    "xiaohongshu.com": "#FE2C55",
    "csdn.net": "#FC5531",
    "juejin.cn": "#1E80FF",
  };
  
  const withoutWww = domain.replace(/^www\./, "");
  if (colorMap[withoutWww]) {
    return colorMap[withoutWww];
  }
  
  const parts = withoutWww.split(".");
  if (parts.length >= 2) {
    const mainDomain = parts.slice(-2).join(".");
    if (colorMap[mainDomain]) {
      return colorMap[mainDomain];
    }
  }
  
  // 默认颜色
  return "var(--orca-color-primary)";
}

/**
 * 内联引用标签组件
 */
export default function InlineCitation({ 
  citation, 
  showDomain = true,
  compact = false 
}: InlineCitationProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  
  const handleClick = useCallback(() => {
    if (citation.url) {
      window.open(citation.url, '_blank', 'noopener,noreferrer');
    }
  }, [citation.url]);
  
  const friendlyName = getFriendlyDomainName(citation.domain);
  const brandColor = getDomainColor(citation.domain);
  
  // 紧凑模式：只显示数字
  if (compact) {
    return createElement(
      "sup",
      {
        style: {
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          background: brandColor,
          color: "white",
          borderRadius: "50%",
          width: "16px",
          height: "16px",
          fontSize: "10px",
          fontWeight: 600,
          cursor: "pointer",
          marginLeft: "2px",
          verticalAlign: "super",
          transition: "all 0.2s",
          transform: isHovered ? "scale(1.15)" : "scale(1)",
        },
        onClick: handleClick,
        onMouseEnter: () => setIsHovered(true),
        onMouseLeave: () => setIsHovered(false),
        title: `${citation.title} - ${friendlyName}`,
      },
      String(citation.index)
    );
  }
  
  // 完整模式：显示域名标签
  return createElement(
    "span",
    {
      style: {
        display: "inline-flex",
        alignItems: "center",
        gap: "2px",
        marginLeft: "4px",
        verticalAlign: "middle",
        position: "relative",
      },
      onMouseEnter: () => {
        setIsHovered(true);
        setShowTooltip(true);
      },
      onMouseLeave: () => {
        setIsHovered(false);
        setShowTooltip(false);
      },
    },
    // 域名标签
    showDomain && createElement(
      "span",
      {
        style: {
          display: "inline-flex",
          alignItems: "center",
          gap: "3px",
          background: isHovered ? brandColor : `${brandColor}15`,
          color: isHovered ? "white" : brandColor,
          padding: "1px 6px",
          borderRadius: "4px",
          fontSize: "11px",
          fontWeight: 500,
          cursor: "pointer",
          transition: "all 0.2s",
          border: `1px solid ${brandColor}30`,
          whiteSpace: "nowrap",
        },
        onClick: handleClick,
      },
      friendlyName,
      // 如果有多个引用，显示数量
      citation.index > 0 && createElement(
        "span",
        {
          style: {
            background: isHovered ? "rgba(255,255,255,0.3)" : brandColor,
            color: isHovered ? "white" : "white",
            borderRadius: "50%",
            width: "14px",
            height: "14px",
            fontSize: "9px",
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          },
        },
        String(citation.index)
      )
    ),
    // 悬浮提示卡片
    showTooltip && citation.snippet && createElement(
      "div",
      {
        style: {
          position: "absolute",
          bottom: "100%",
          left: "0",
          marginBottom: "8px",
          background: "var(--orca-color-bg-1)",
          border: "1px solid var(--orca-color-border)",
          borderRadius: "8px",
          padding: "12px",
          boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
          zIndex: 1000,
          width: "280px",
          maxWidth: "90vw",
        },
      },
      // 标题
      createElement(
        "div",
        {
          style: {
            fontSize: "13px",
            fontWeight: 600,
            color: "var(--orca-color-text-1)",
            marginBottom: "6px",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          },
        },
        citation.title
      ),
      // 摘要
      createElement(
        "div",
        {
          style: {
            fontSize: "12px",
            color: "var(--orca-color-text-2)",
            lineHeight: 1.5,
            display: "-webkit-box",
            WebkitLineClamp: 3,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          },
        },
        citation.snippet
      ),
      // 来源
      createElement(
        "div",
        {
          style: {
            fontSize: "11px",
            color: "var(--orca-color-text-3)",
            marginTop: "8px",
            display: "flex",
            alignItems: "center",
            gap: "4px",
          },
        },
        createElement("i", { className: "ti ti-external-link", style: { fontSize: "12px" } }),
        citation.domain
      )
    )
  );
}

/**
 * 批量内联引用标签组件
 * 用于在一句话后面显示多个来源
 */
export function InlineCitationGroup({ 
  citations,
  maxShow = 3,
}: { 
  citations: InlineCitationData[];
  maxShow?: number;
}) {
  if (citations.length === 0) return null;
  
  const visibleCitations = citations.slice(0, maxShow);
  const hiddenCount = citations.length - maxShow;
  
  return createElement(
    "span",
    {
      style: {
        display: "inline-flex",
        alignItems: "center",
        gap: "4px",
        marginLeft: "4px",
      },
    },
    ...visibleCitations.map((citation, index) => 
      createElement(InlineCitation, {
        key: citation.index,
        citation,
        showDomain: true,
        compact: false,
      })
    ),
    hiddenCount > 0 && createElement(
      "span",
      {
        style: {
          fontSize: "11px",
          color: "var(--orca-color-text-3)",
          padding: "2px 6px",
          background: "var(--orca-color-bg-3)",
          borderRadius: "4px",
        },
      },
      `+${hiddenCount}`
    )
  );
}
