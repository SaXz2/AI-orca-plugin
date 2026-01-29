# ChatGPT风格增强功能 - 快速设置指南

## 🎯 功能概述

本插件为AI聊天添加了类似ChatGPT的增强功能：
- **自动图片搜索** - 即使AI不主动调用，也会自动为相关内容搜索图片
- **智能引用来源** - 自动添加引用标记和来源列表
- **多搜索引擎支持** - Google Images、Bing Images、DuckDuckGo Images

## 🚀 5分钟快速开始

### 步骤1：启用联网搜索
1. 在Orca Note中打开AI聊天面板
2. 点击右上角的设置图标 ⚙️
3. 找到"联网搜索"部分
4. 勾选"启用联网搜索"

### 步骤2：添加搜索引擎（选择一种）

#### 方案A：使用Google Images（推荐，最稳定）
1. 获取Google Cloud API Key：
   - 访问 [Google Cloud Console](https://console.cloud.google.com/)
   - 启用"Custom Search API"
   - 创建API Key
2. 创建Custom Search Engine：
   - 访问 [Google Custom Search](https://cse.google.com/)
   - 创建搜索引擎，搜索整个网络
   - 获取Search Engine ID (cx参数)
3. 在联网搜索设置中：
   - 选择"Google"
   - 输入API Key和Search Engine ID
   - 点击保存

#### 方案B：使用Bing Images（备选方案）
1. 获取Bing Search API Key：
   - 访问 [Azure Portal](https://portal.azure.com/)
   - 创建"Bing Search v7"资源
   - 获取API Key
2. 在联网搜索设置中：
   - 选择"Bing"
   - 输入API Key
   - 点击保存

#### 方案C：DuckDuckGo（免费但不稳定）
⚠️ **注意：** DuckDuckGo图片搜索可能会遇到访问限制（403错误），建议优先使用上述API方案。

如果要尝试DuckDuckGo：
1. 在联网搜索设置中点击"添加搜索引擎"
2. 选择"DuckDuckGo"
3. 设置名称为"DuckDuckGo"
4. 点击保存

### 步骤3：测试功能

尝试这些查询：

```
谁是埃隆·马斯克？
介绍一下埃菲尔铁塔
什么是iPhone 15？
北京天安门广场
樱花盛开的景象
```

## 🎯 预期效果

当你问这些问题时，AI会：

1. **自动检测**需要图片的查询
2. **搜索相关图片**（通常2-3张）
3. **在回复顶部显示图片**
4. **提供详细的文字说明**
5. **在底部显示引用来源**

### 示例效果：

**你问：** "谁是埃隆·马斯克？"

**AI回复：**
```
[显示埃隆·马斯克的照片 - 3张图片网格]

埃隆·马斯克（Elon Musk）是一位南非出生的企业家和工程师...

参考来源：
[1] Wikipedia - 埃隆·马斯克
[2] Tesla官网
[3] SpaceX官网
```

## 🔧 故障排除

### 问题1：DuckDuckGo返回403错误
- **原因**：DuckDuckGo检测到自动化请求并阻止访问
- **解决**：配置Google Images或Bing Images API
- **临时方案**：直接问AI描述外观，不使用图片搜索

### 问题2：没有显示图片
- 检查是否启用了联网搜索
- 确认搜索引擎配置正确（推荐Google Images）
- 尝试更明确的查询，如"给我看看埃菲尔铁塔的照片"

### 问题3：图片加载失败
- 检查网络连接
- 如果使用API Key，确认配额未用完
- 检查API Key是否正确配置

## 💡 使用技巧

### 最容易触发图片搜索的查询类型：
- **人物**："谁是XXX？"、"XXX长什么样？"
- **地点**："XXX在哪里？"、"介绍XXX景点"
- **物品**："什么是XXX？"、"XXX的外观"
- **概念**："XXX是什么样子的？"

### 手动触发图片搜索：
- "搜索XXX的图片"
- "给我看看XXX"
- "找一些XXX的照片"

## 🎨 自定义设置

在联网搜索设置中，你可以：
- 设置最大图片数量（默认3张）
- 选择图片搜索引擎优先级
- 启用/禁用图片搜索功能

## 📊 API配额参考

- **Google Custom Search**: 每天100次免费，超出$5/1000次（推荐）
- **Bing Search**: 每月1000次免费，超出按量计费
- **DuckDuckGo**: 完全免费，但可能遇到访问限制

## 🚀 高级用法

一旦设置完成，你可以：
- 问任何关于人物、地点、物品的问题
- AI会自动判断是否需要图片
- 图片支持点击放大查看
- 每个引用都可以点击跳转到原始来源

---

**开始体验吧！** 🎉 试试问"谁是乔布斯？"或"埃菲尔铁塔长什么样？"