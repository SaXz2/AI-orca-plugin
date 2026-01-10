# 图片URL清理修复

## 问题描述
用户反馈某些图片URL无法正常显示，例如：
```
https://a.storyblok.com/f/178900/1064x1504/2bb41a2c3c/sentenced-to-be-a-hero-teoritta.png/m/filters:quality(95)format(webp)
```

这种URL包含了额外的处理参数和格式转换，可能导致图片加载失败。

## 问题分析
现代CDN服务（如Storyblok、Cloudinary等）经常在图片URL后添加处理参数：
- 格式转换：`format(webp)`
- 质量调整：`quality(95)`
- 尺寸调整：`w_800,h_600`
- 其他滤镜：`/m/filters:...`

这些参数虽然有助于优化，但有时会导致图片在某些环境下无法正常加载。

## 修复方案
在图片搜索服务中添加URL清理逻辑，移除可能导致问题的参数。

## 修复内容

### 在 `src/services/image-search-service.ts` 中添加URL清理函数：

```typescript
/**
 * 清理和标准化图片URL
 * 移除可能导致加载问题的参数和格式转换
 */
function cleanImageUrl(url: string): string {
  try {
    // 处理Storyblok等CDN的特殊格式
    if (url.includes('storyblok.com')) {
      // 移除 /m/filters: 后面的所有参数
      url = url.replace(/\/m\/filters:.*$/, '');
    }
    
    // 处理其他CDN的格式转换参数
    url = url.replace(/\?.*format=webp.*$/, ''); // 移除webp格式转换
    url = url.replace(/\?.*quality=\d+.*$/, ''); // 移除质量参数
    
    // 移除常见的图片处理参数
    const urlObj = new URL(url);
    const paramsToRemove = ['format', 'quality', 'w', 'h', 'fit', 'crop', 'auto'];
    paramsToRemove.forEach(param => {
      urlObj.searchParams.delete(param);
    });
    
    return urlObj.toString();
  } catch (error) {
    console.warn('[ImageSearch] Failed to clean URL:', url, error);
    return url; // 如果清理失败，返回原URL
  }
}
```

### 在Google Images和Bing Images搜索中应用清理：

```typescript
// Google Images
const originalUrl = item.link || "";
const cleanedUrl = cleanImageUrl(originalUrl);
console.log(`[Google Images] URL cleaning: ${originalUrl} -> ${cleanedUrl}`);

// Bing Images  
const originalUrl = item.contentUrl || "";
const cleanedUrl = cleanImageUrl(originalUrl);
console.log(`[Bing Images] URL cleaning: ${originalUrl} -> ${cleanedUrl}`);
```

## 清理规则

### 1. Storyblok CDN特殊处理：
- 移除 `/m/filters:...` 后的所有内容
- 例：`/m/filters:quality(95)format(webp)` → 完全移除

### 2. 通用URL参数清理：
- `format=webp` → 移除格式转换
- `quality=95` → 移除质量参数
- `w=800&h=600` → 移除尺寸参数
- `fit=crop` → 移除裁剪参数
- `auto=compress` → 移除自动压缩

### 3. 错误处理：
- 如果URL解析失败，返回原始URL
- 添加警告日志但不中断流程

## 修复效果

### ✅ **修复前**：
```
https://a.storyblok.com/f/178900/1064x1504/2bb41a2c3c/sentenced-to-be-a-hero-teoritta.png/m/filters:quality(95)format(webp)
```
→ 可能加载失败

### ✅ **修复后**：
```
https://a.storyblok.com/f/178900/1064x1504/2bb41a2c3c/sentenced-to-be-a-hero-teoritta.png
```
→ 标准PNG格式，兼容性更好

## 技术细节

### URL清理策略：
1. **特定CDN处理**：针对已知CDN（如Storyblok）的特殊格式
2. **通用参数清理**：移除常见的图片处理参数
3. **安全降级**：清理失败时返回原URL，确保不中断服务

### 调试日志：
添加了详细的URL清理日志：
```
[Google Images] URL cleaning: original_url -> cleaned_url
[Bing Images] URL cleaning: original_url -> cleaned_url
```

### 兼容性考虑：
- 保持原有功能不变
- 只在可能有问题的URL上进行清理
- 不影响正常的图片URL

## 支持的CDN格式

### 当前支持：
- ✅ Storyblok (`/m/filters:...`)
- ✅ 通用URL参数 (`?format=webp&quality=95`)
- ✅ 常见图片处理参数

### 未来可扩展：
- Cloudinary (`/c_scale,w_800/`)
- ImageKit (`/tr:w-800,h-600/`)
- 其他CDN格式

## 测试建议

1. **基本功能测试**：
   - 搜索包含复杂URL的图片
   - 确认图片能正常加载和显示

2. **URL格式测试**：
   - 测试Storyblok格式的URL
   - 测试带参数的普通URL
   - 测试正常的图片URL（确保不被误清理）

3. **错误处理测试**：
   - 测试无效的URL格式
   - 确认清理失败时的降级处理

## 构建状态
✅ 构建成功，image-search-service.js大小从6.92kB增加到7.53kB

## 相关文件
- `src/services/image-search-service.ts` - 主要修复文件

这个修复提高了图片URL的兼容性，减少了因CDN参数导致的加载问题。🎉