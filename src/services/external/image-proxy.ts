/**
 * Image Proxy Service - 处理需要特殊请求头的图片加载
 * 
 * 功能：
 * - 代理 Instagram 等有防盗链的图片
 * - 转换为 base64 或 blob URL
 * - 缓存已加载的图片
 */

interface ProxiedImage {
  originalUrl: string;
  dataUrl: string;
  mimeType: string;
  size: number;
  timestamp: number;
}

// 图片缓存（内存）
const imageCache = new Map<string, ProxiedImage>();

// 缓存过期时间（30分钟）
const CACHE_EXPIRY = 30 * 60 * 1000;

/**
 * 检测是否需要代理的 URL
 */
export function needsProxy(url: string): boolean {
  return (
    url.includes("cdninstagram.com") ||
    url.includes("instagram.com") ||
    url.includes("fbcdn.net")
  );
}

/**
 * 获取图片的 MIME 类型
 */
function getMimeTypeFromUrl(url: string): string {
  const ext = url.split("?")[0].split(".").pop()?.toLowerCase();
  const mimeMap: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    avif: "image/avif",
  };
  return mimeMap[ext || ""] || "image/jpeg";
}

/**
 * 清理过期的缓存
 */
function cleanExpiredCache() {
  const now = Date.now();
  for (const [url, cached] of imageCache.entries()) {
    if (now - cached.timestamp > CACHE_EXPIRY) {
      imageCache.delete(url);
    }
  }
}

/**
 * 代理加载图片并转换为 data URL
 * @param url 原始图片 URL
 * @param referer 可选的 referer 头
 * @returns data URL
 */
export async function proxyImage(
  url: string,
  referer?: string
): Promise<string | null> {
  // 检查缓存
  const cached = imageCache.get(url);
  if (cached && Date.now() - cached.timestamp < CACHE_EXPIRY) {
    console.log("[image-proxy] Using cached image:", url);
    return cached.dataUrl;
  }

  try {
    console.log("[image-proxy] Fetching image:", url);

    // 构建请求头
    const headers: Record<string, string> = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      "Sec-Fetch-Dest": "image",
      "Sec-Fetch-Mode": "no-cors",
      "Sec-Fetch-Site": "cross-site",
    };

    // 对于 Instagram，添加 referer
    if (url.includes("instagram.com") || url.includes("cdninstagram.com")) {
      headers["Referer"] = referer || "https://www.instagram.com/";
    }

    const response = await fetch(url, {
      headers,
      mode: "cors",
      credentials: "omit",
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const blob = await response.blob();
    const mimeType = blob.type || getMimeTypeFromUrl(url);

    // 转换为 base64
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });

    // 缓存结果
    const proxied: ProxiedImage = {
      originalUrl: url,
      dataUrl,
      mimeType,
      size: blob.size,
      timestamp: Date.now(),
    };
    imageCache.set(url, proxied);

    // 定期清理过期缓存
    if (imageCache.size > 50) {
      cleanExpiredCache();
    }

    console.log("[image-proxy] Image loaded successfully:", url, `(${blob.size} bytes)`);
    return dataUrl;
  } catch (error) {
    console.error("[image-proxy] Failed to proxy image:", url, error);
    return null;
  }
}

/**
 * 批量代理图片
 */
export async function proxyImages(
  urls: string[],
  referer?: string
): Promise<Map<string, string>> {
  const results = new Map<string, string>();

  await Promise.all(
    urls.map(async (url) => {
      const dataUrl = await proxyImage(url, referer);
      if (dataUrl) {
        results.set(url, dataUrl);
      }
    })
  );

  return results;
}

/**
 * 清除所有缓存
 */
export function clearCache() {
  imageCache.clear();
  console.log("[image-proxy] Cache cleared");
}

/**
 * 获取缓存统计
 */
export function getCacheStats() {
  const now = Date.now();
  let totalSize = 0;
  let expiredCount = 0;

  for (const cached of imageCache.values()) {
    totalSize += cached.size;
    if (now - cached.timestamp > CACHE_EXPIRY) {
      expiredCount++;
    }
  }

  return {
    count: imageCache.size,
    totalSize,
    expiredCount,
  };
}
