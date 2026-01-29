# fetch_url - 网页内容抓取

## 功能
抓取指定 URL 的网页内容，提取有效信息。

## 参数
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| url | string | ✅ | 完整的 http:// 或 https:// 链接 |
| max_length | number | ❌ | 最大内容长度（字符），默认100000 |

## 使用示例
```json
{"url": "https://example.com/article"}
{"url": "https://en.wikipedia.org/wiki/Python_(programming_language)", "max_length": 50000}
```

## 何时使用
- 用户提供了具体的网址链接
- 需要查看某个网页的详细内容
- 需要提取网页中的表格、数据、文章等信息
- Wikipedia 表格内容不完整时，可以直接抓取 Wikipedia 页面

## 返回内容
- 网页标题
- 转换为 Markdown 格式的内容
- 保留表格、列表、标题等结构
- 自动清理广告、脚本等无关内容

## 注意事项
⚠️ 只支持公开可访问的网页
⚠️ 某些网站可能有反爬虫限制
⚠️ 内容过长会自动截断
⚠️ 不支持需要登录的页面
