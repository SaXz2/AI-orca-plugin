# Instagram URL Parser

Instagram 链接解析工具，可以从各种 Instagram URL 格式中提取真实的图片地址，并通过代理解决防盗链问题。

## 问题背景

Instagram 的图片链接有多层结构和防盗链保护：

1. **SEO/Widget URL** - 爬虫入口
   ```
   https://lookaside.instagram.com/seo/google_widget/crawler/?media_id=3595095639669043484
   ```

2. **帖子页面** - 用户可见链接
   ```
   https://www.instagram.com/p/DPvDh5cAFql
   ```

3. **CDN 图片** - 真实图片资源（有防盗链）
   ```
   https://scontent-nrt1-2.cdninstagram.com/v/t39.30808-6/559306577_...jpg
   ```

**防盗链问题：** Instagram CDN 图片直接在浏览器中加载会失败，需要正确的 Referer 和请求头。

## 解决方案

本工具提供两种方式：

1. **直接解析** - 返回 CDN URL（可能无法直接加载）
2. **代理加载** - 通过代理获取图片并转换为 base64 data URL（推荐）

## 使用方法

### 基础用法（推荐：使用代理）

```typescript
import { getInstagramImageUrl } from "./utils/instagram-helper";

// 使用代理加载（返回 data URL，可直接在 <img> 中使用）
const dataUrl = await getInstagramImageUrl(
  "https://lookaside.instagram.com/seo/google_widget/crawler/?media_id=3595095639669043484",
  true  // 使用代理
);

// 直接在 HTML 中使用
// <img src={dataUrl} alt="Instagram image" />
```

### 不使用代理（仅获取 URL）

```typescript
// 不使用代理（返回原始 CDN URL）
const imageUrl = await getInstagramImageUrl(url, false);
// 注意：这个 URL 可能因为防盗链无法直接加载
```

### 批量处理

```typescript
import { extractInstagramImages } from "./utils/instagram-helper";

const text = `
  Check out:
  https://www.instagram.com/p/DPvDh5cAFql
  https://lookaside.instagram.com/seo/google_widget/crawler/?media_id=123
`;

// 提取所有图片（使用代理）
const images = await extractInstagramImages(text, true);
// 返回 data URL 数组，可直接使用
```

### 替换文本中的链接

```typescript
import { replaceInstagramUrls } from "./utils/instagram-helper";

const text = "Check out https://www.instagram.com/p/DPvDh5cAFql";
const replaced = await replaceInstagramUrls(text, true);
// Instagram 链接会被替换为 data URL
```

## 工作原理

### 1. URL 解析流程

1. **URL 类型检测** - 识别 lookaside、post 或 CDN URL
2. **重定向跟踪** - 对于 lookaside URL，跟踪重定向到帖子页面
3. **HTML 解析** - 从帖子页面提取图片 URL
   - 优先使用嵌入 API (`/embed/captioned/`)
   - 备用方案：主页面的 `og:image` meta 标签
   - 最后尝试：`window._sharedData` JSON 数据
   - 正则匹配 CDN URL

### 2. 代理加载流程

Instagram CDN 图片有防盗链保护，直接加载会失败。代理服务解决这个问题：

1. **检测需要代理的 URL** - Instagram CDN 域名
2. **添加正确的请求头**
   - `User-Agent`: 模拟浏览器
   - `Referer`: Instagram 域名
   - `Accept`: 图片 MIME 类型
   - `Sec-Fetch-*`: 安全上下文
3. **转换为 data URL** - 将图片转为 base64，可直接在 HTML 中使用
4. **缓存管理** - 内存缓存 30 分钟，避免重复请求

### 3. 缓存机制

```typescript
import { getCacheStats, clearCache } from "./services/image-proxy";

// 查看缓存统计
const stats = getCacheStats();
console.log(stats);
// { count: 5, totalSize: 1234567, expiredCount: 0 }

// 清除缓存
clearCache();
```

## API 参考

### `parseInstagramUrl(url: string)`

解析单个 Instagram URL。

**参数：**
- `url` - Instagram URL（lookaside、post 或 CDN 格式）

**返回：**
```typescript
{
  imageUrl: string;    // 真实图片 URL
  postUrl: string;     // 帖子页面 URL
  mediaId?: string;    // 媒体 ID（如果可用）
}
```

### `getInstagramImageUrl(url: string, useProxy: boolean = true)`

快速获取图片 URL 或 data URL。

**参数：**
- `url` - Instagram URL
- `useProxy` - 是否使用代理（默认 true）

**返回：** 图片 URL 或 base64 data URL

### `proxyImage(url: string, referer?: string)`

代理加载图片并转换为 data URL。

**参数：**
- `url` - 图片 URL
- `referer` - 可选的 Referer 头

**返回：** base64 data URL

### `extractInstagramImages(text: string, useProxy: boolean = true)`

从文本中提取所有 Instagram 图片。

**参数：**
- `text` - 包含 Instagram 链接的文本
- `useProxy` - 是否使用代理

**返回：** 图片 URL 或 data URL 数组


## 注意事项

- 需要网络访问权限
- Instagram 可能会更改页面结构，导致解析失败
- 某些私密帖子可能无法访问
- 建议添加错误处理和重试逻辑

## 集成到现有服务

可以在 `image-search-service.ts` 或 `content-fetcher.ts` 中集成：

```typescript
import { parseInstagramUrl } from "./instagram-parser";

// 在图片搜索时自动处理 Instagram 链接
async function fetchImage(url: string) {
  if (url.includes("instagram.com")) {
    const result = await parseInstagramUrl(url);
    if (result) {
      url = result.imageUrl;
    }
  }
  
  // 继续正常的图片获取流程
  return fetch(url);
}
```

## 测试

在浏览器控制台中测试：

```javascript
// 导入工具
const { getInstagramImageUrl } = await import("./utils/instagram-helper");

// 测试
const url = "https://lookaside.instagram.com/seo/google_widget/crawler/?media_id=3595095639669043484";
const imageUrl = await getInstagramImageUrl(url);
console.log(imageUrl);
```
