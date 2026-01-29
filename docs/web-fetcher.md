# Web Fetcher - 网页内容抓取工具

通用的网页内容抓取工具，让 AI 能够直接获取任意网页的内容。

## 功能特点

1. **通用性** - 支持抓取任何公开可访问的网页
2. **智能转换** - 自动将 HTML 转换为 Markdown 格式
3. **结构保留** - 保留标题、列表、表格、链接等结构
4. **内容清理** - 自动移除广告、脚本、样式等无关内容
5. **长度控制** - 可配置最大内容长度，避免过长

## 使用场景

### 1. Wikipedia 表格完整抓取
当 Wikipedia API 返回的表格内容不完整时：
```typescript
// AI 可以直接抓取 Wikipedia 页面
fetch_url(url: "https://zh.wikipedia.org/wiki/勇者之渣")
```

### 2. 新闻文章阅读
```typescript
fetch_url(url: "https://example.com/news/article-123")
```

### 3. 技术文档查看
```typescript
fetch_url(url: "https://docs.example.com/api/reference")
```

### 4. 博客文章分析
```typescript
fetch_url(url: "https://blog.example.com/post/how-to-code")
```

## AI 工具定义

```typescript
{
  name: "fetch_url",
  description: "抓取指定 URL 的网页内容",
  parameters: {
    url: string,        // 必需：完整的 http:// 或 https:// URL
    max_length: number  // 可选：最大内容长度（默认 100000 字符）
  }
}
```

## 返回格式

```markdown
# 网页标题

🔗 来源: https://example.com/page
📊 内容长度: 12,345 字符

---

[转换后的 Markdown 内容]
- 保留标题层级
- 保留列表结构
- 保留表格（转为 Markdown 表格）
- 保留链接
- 清理了广告和脚本
```

## HTML 转 Markdown 规则

### 支持的元素

- **标题**: `<h1>` - `<h6>` → `#` - `######`
- **段落**: `<p>` → 段落 + 空行
- **列表**: `<ul>`, `<ol>`, `<li>` → Markdown 列表
- **链接**: `<a href="...">text</a>` → `[text](...)`
- **粗体**: `<strong>`, `<b>` → `**text**`
- **斜体**: `<em>`, `<i>` → `*text*`
- **代码**: `<code>` → `` `code` ``
- **代码块**: `<pre>` → ` ```code``` `
- **表格**: `<table>` → Markdown 表格
- **换行**: `<br>` → 换行

### 自动清理

- ❌ `<script>` - JavaScript 代码
- ❌ `<style>` - CSS 样式
- ❌ `<noscript>` - 无脚本内容
- ❌ HTML 注释
- ❌ 广告和追踪代码

## 配置选项

```typescript
interface FetchOptions {
  timeout?: number;      // 超时时间（毫秒），默认 30000
  maxLength?: number;    // 最大内容长度，默认 100000
  includeRawHtml?: boolean; // 是否包含原始 HTML（未实现）
}
```

## 错误处理

常见错误及解决方案：

### 1. HTTP 错误
```
HTTP 404: Not Found
```
**原因**: URL 不存在或已失效  
**解决**: 检查 URL 是否正确

### 2. 超时错误
```
请求超时 (30000ms)
```
**原因**: 网站响应太慢  
**解决**: 增加 timeout 参数或稍后重试

### 3. 内容类型错误
```
不支持的内容类型: application/pdf
```
**原因**: 目标不是 HTML 网页  
**解决**: 只能抓取 HTML 内容

### 4. 访问限制
```
HTTP 403: Forbidden
```
**原因**: 网站有反爬虫保护  
**解决**: 某些网站无法抓取

## 限制说明

1. **仅支持公开网页** - 不支持需要登录的页面
2. **反爬虫限制** - 某些网站可能拒绝访问
3. **内容长度限制** - 默认最大 100000 字符
4. **仅支持 HTML** - 不支持 PDF、图片等其他格式
5. **JavaScript 渲染** - 不支持需要 JavaScript 渲染的动态内容

## 与 Wikipedia 工具的配合

Wikipedia 工具使用 API 获取结构化数据，但表格可能不完整。可以配合使用：

```typescript
// 1. 先用 Wikipedia 工具获取基本信息
wikipedia(query: "某个主题")

// 2. 如果表格内容不完整，直接抓取页面
fetch_url(url: "https://zh.wikipedia.org/wiki/某个主题")
```

## 批量抓取

虽然 AI 工具一次只能抓取一个 URL，但服务层支持批量：

```typescript
import { fetchMultipleUrls } from "./services/web-fetcher";

const results = await fetchMultipleUrls([
  "https://example.com/page1",
  "https://example.com/page2",
  "https://example.com/page3",
], {
  concurrency: 3,  // 并发数
  maxLength: 50000,
});
```

## 性能考虑

- **超时设置**: 默认 30 秒，可根据需要调整
- **内容限制**: 避免抓取过大的页面
- **并发控制**: 批量抓取时控制并发数
- **缓存**: 目前未实现缓存，每次都重新抓取

## 安全注意事项

1. **URL 验证** - 必须是 http:// 或 https://
2. **内容清理** - 自动移除脚本和样式
3. **超时保护** - 避免长时间等待
4. **错误处理** - 友好的错误提示

## 未来改进

- [ ] 支持 JavaScript 渲染（使用 Puppeteer）
- [ ] 添加内容缓存机制
- [ ] 支持更多内容类型（PDF、图片 OCR）
- [ ] 智能内容提取（只提取主要内容）
- [ ] 支持代理和自定义请求头
- [ ] 更好的表格转换算法
