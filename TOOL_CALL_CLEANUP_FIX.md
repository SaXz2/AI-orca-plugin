# 工具调用XML标记清理修复

## 问题描述
用户反馈AI回复中显示了原始的工具调用XML标记，例如：
```
<｜DSML｜function_calls><｜DSML｜invoke name="imageSearch"><｜DSML｜parameter name="query" string="true">Sentenced to Be a Hero anime character design art</｜DSML｜parameter><｜DSML｜parameter name="maxResults" string="false">4</｜DSML｜parameter></｜DSML｜invoke></｜DSML｜function_calls>
```

这些XML标记应该被隐藏，只显示工具的执行结果。

## 问题分析
AI回复的内容中包含了工具调用的原始XML标记，但是在显示给用户之前没有被正确清理。这些标记是AI模型内部使用的格式，不应该暴露给最终用户。

## 修复方案
在`EnhancedMarkdownMessage`组件中添加工具调用XML标记的清理逻辑。

## 修复内容

### 在 `src/components/EnhancedMarkdownMessage.tsx` 中添加清理逻辑：

```typescript
// 直接使用原始内容，但需要清理工具调用标记
let contentToUse = content;

// 清理工具调用XML标记 - 这些不应该显示给用户
contentToUse = contentToUse.replace(/<｜DSML｜function_calls>[\s\S]*?<\/｜DSML｜function_calls>/g, '');
contentToUse = contentToUse.replace(/<｜DSML｜invoke[\s\S]*?<\/｜DSML｜invoke>/g, '');
contentToUse = contentToUse.replace(/<｜DSML｜parameter[\s\S]*?<\/｜DSML｜parameter>/g, '');

// 清理其他可能的工具调用格式
contentToUse = contentToUse.replace(/<function_calls>[\s\S]*?<\/function_calls>/g, '');
contentToUse = contentToUse.replace(/<invoke[\s\S]*?<\/invoke>/g, '');

// 清理多余的空行
contentToUse = contentToUse.replace(/\n{3,}/g, '\n\n').trim();
```

## 清理的XML标记格式

### 1. DSML格式（主要格式）：
- `<｜DSML｜function_calls>...</｜DSML｜function_calls>`
- `<｜DSML｜invoke ...>...</｜DSML｜invoke>`
- `<｜DSML｜parameter ...>...</｜DSML｜parameter>`

### 2. 标准格式（备用）：
- `<function_calls>...</function_calls>`
- `<invoke ...>...</invoke>`

## 修复效果

### ✅ **修复前**：
```
很好！找到了一些图片。让我再搜索一些具体的动画场景和角色图片：<｜DSML｜function_calls><｜DSML｜invoke name="imageSearch"><｜DSML｜parameter name="query" string="true">Sentenced to Be a Hero anime character design art</｜DSML｜parameter><｜DSML｜parameter name="maxResults" string="false">4</｜DSML｜parameter></｜DSML｜invoke></｜DSML｜function_calls>
```

### ✅ **修复后**：
```
很好！找到了一些图片。让我再搜索一些具体的动画场景和角色图片：

[显示搜索到的图片]
```

## 技术细节

### 正则表达式说明：
- `[\s\S]*?` - 匹配任意字符（包括换行符），非贪婪模式
- `<\/｜DSML｜function_calls>` - 匹配结束标签，需要转义特殊字符
- `g` 标志 - 全局匹配，清理所有出现的标记

### 清理顺序：
1. 先清理DSML格式的标记（最常见）
2. 再清理标准格式的标记（备用）
3. 最后清理多余的空行

### 调试日志：
添加了日志来跟踪清理效果：
```typescript
console.log(`[EnhancedMarkdownMessage] Cleaned content from ${content.length} to ${contentToUse.length} chars`);
```

## 测试建议

1. **基本功能测试**：
   - 让AI调用imageSearch工具
   - 确认回复中不显示XML标记
   - 确认图片正常显示

2. **多种工具测试**：
   - 测试webSearch工具调用
   - 测试其他工具调用
   - 确认所有XML标记都被清理

3. **边界情况测试**：
   - 测试包含多个工具调用的回复
   - 测试嵌套的XML标记
   - 测试不完整的XML标记

## 构建状态
✅ 构建成功，无错误和警告

## 相关文件
- `src/components/EnhancedMarkdownMessage.tsx` - 主要修复文件

这个修复确保了用户看到的AI回复是干净的，没有技术细节的干扰，提供更好的用户体验。🎉