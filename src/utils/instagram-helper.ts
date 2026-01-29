/**
 * Instagram Helper - 便捷的 Instagram 处理工具
 */

import { parseInstagramUrl, extractAndParseInstagramUrls } from "../services/instagram-parser";
import { proxyImage, needsProxy } from "../services/image-proxy";

/**
 * 快速获取 Instagram 图片 URL
 * @param url Instagram URL（任意格式）
 * @param useProxy 是否使用代理加载（返回 data URL）
 * @returns 图片 URL 或 data URL
 */
export async function getInstagramImageUrl(
  url: string,
  useProxy: boolean = true
): Promise<string | null> {
  const result = await parseInstagramUrl(url);
  if (!result?.imageUrl) return null;

  // 如果需要代理且用户要求使用代理
  if (useProxy && needsProxy(result.imageUrl)) {
    return await proxyImage(result.imageUrl, result.postUrl);
  }

  return result.imageUrl;
}

/**
 * 从文本中提取所有 Instagram 图片
 * @param text 包含 Instagram 链接的文本
 * @param useProxy 是否使用代理加载
 * @returns 图片 URL 数组（可能是 data URL）
 */
export async function extractInstagramImages(
  text: string,
  useProxy: boolean = true
): Promise<string[]> {
  const results = await extractAndParseInstagramUrls(text);
  
  if (!useProxy) {
    return results.map(r => r.imageUrl);
  }

  // 使用代理加载所有图片
  const images: string[] = [];
  for (const result of results) {
    if (needsProxy(result.imageUrl)) {
      const dataUrl = await proxyImage(result.imageUrl, result.postUrl);
      if (dataUrl) {
        images.push(dataUrl);
      }
    } else {
      images.push(result.imageUrl);
    }
  }

  return images;
}

/**
 * 替换文本中的 Instagram 链接为真实图片 URL
 * @param text 原始文本
 * @param useProxy 是否使用代理（返回 data URL）
 * @returns 替换后的文本
 */
export async function replaceInstagramUrls(
  text: string,
  useProxy: boolean = true
): Promise<string> {
  const results = await extractAndParseInstagramUrls(text);
  
  let replacedText = text;
  for (const result of results) {
    let imageUrl = result.imageUrl;
    
    // 如果需要代理，先加载图片
    if (useProxy && needsProxy(imageUrl)) {
      const dataUrl = await proxyImage(imageUrl, result.postUrl);
      if (dataUrl) {
        imageUrl = dataUrl;
      }
    }
    
    // 查找原始 URL 并替换
    const urlRegex = new RegExp(
      result.postUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      "g"
    );
    replacedText = replacedText.replace(urlRegex, imageUrl);
  }
  
  return replacedText;
}

/**
 * 示例用法
 */
export const instagramExamples = {
  // 示例 1: 解析 lookaside URL（使用代理）
  async example1() {
    const url = "https://lookaside.instagram.com/seo/google_widget/crawler/?media_id=3595095639669043484";
    const imageUrl = await getInstagramImageUrl(url, true);
    console.log("Image Data URL:", imageUrl?.substring(0, 100) + "...");
  },

  // 示例 2: 解析帖子 URL（不使用代理）
  async example2() {
    const url = "https://www.instagram.com/p/DPvDh5cAFql";
    const imageUrl = await getInstagramImageUrl(url, false);
    console.log("Image URL:", imageUrl);
  },

  // 示例 3: 从文本中提取所有图片（使用代理）
  async example3() {
    const text = `
      Check out these posts:
      https://lookaside.instagram.com/seo/google_widget/crawler/?media_id=3595095639669043484
      https://www.instagram.com/p/DPvDh5cAFql
    `;
    const images = await extractInstagramImages(text, true);
    console.log("Found images:", images.length);
  },
};
