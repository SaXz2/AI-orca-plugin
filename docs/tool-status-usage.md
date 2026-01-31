# 工具状态使用说明

## 三种状态

工具有三种状态，各有明确的使用场景：

### 1. auto（自动批准）
**说明**: AI 可以直接调用，无需询问用户

**适用工具**:
- `searchNotes` - 全文搜索（只读，安全）
- `getPage` - 读取页面（只读，安全）
- `getTodayJournal` - 读取日记（只读，安全）
- 其他只读查询工具

**使用场景**: 频繁使用且无风险的操作

---

### 2. ask（询问用户）
**说明**: 每次调用前弹出确认对话框，等待用户批准

**适用工具**:
- `createBlock` - 创建块（写入操作）
- `createPage` - 创建页面（写入操作）
- `webSearch` - 联网搜索（可能产生费用）
- `imageSearch` - 图片搜索（可能产生费用）
- Skills - 自定义技能（安全考虑）

**使用场景**: 
- 可能修改数据的操作
- 可能产生外部费用的操作
- 需要用户知情的敏感操作

---

### 3. disabled（禁用）
**说明**: 不加载到工具列表，AI 无法使用

**使用场景**: 
- **临时禁用**: 某个工具出问题，暂时关闭但保留配置
- **测试调试**: 排查问题时，逐个禁用工具定位问题
- **精细控制**: 在某个功能模块开启的情况下，单独禁用其中的某个工具

**示例**:
```typescript
// 开启联网搜索功能
setWebSearchEnabled(true);

// 但只禁用图片搜索，保留网页搜索
setToolStatus("imageSearch", "disabled");
setToolStatus("webSearch", "auto");
```

---

## 与开关的区别

### 开关（全局控制）
- `webSearchEnabled` - 控制整个联网搜索模块
- `scriptAnalysisEnabled` - 控制整个脚本分析模块
- `wikipediaEnabled` - 控制 Wikipedia 搜索

**作用**: 一键启用/禁用整个功能模块（包括多个相关工具）

### disabled 状态（精细控制）
**作用**: 针对单个工具进行控制

### 对比示例

#### 场景 1: 完全关闭联网搜索
```typescript
// 方式 1: 使用开关（推荐，一键关闭所有相关工具）
setWebSearchEnabled(false);

// 方式 2: 逐个禁用（繁琐，不推荐）
setToolStatus("webSearch", "disabled");
setToolStatus("imageSearch", "disabled");
setToolStatus("fetchWebContent", "disabled");
```

#### 场景 2: 只禁用图片搜索
```typescript
// 开启联网搜索模块
setWebSearchEnabled(true);

// 精细控制：只禁用图片搜索
setToolStatus("imageSearch", "disabled");
// 其他工具（webSearch、fetchWebContent）仍可用
```

---

## 使用建议

### 推荐配置

**只读操作** → `auto`
- 搜索、读取、查询等操作
- 用户经常使用，无需每次确认

**写入操作** → `ask`
- 创建、修改、删除等操作
- 需要用户知情并确认

**外部服务** → `ask`
- 联网搜索（可能产生费用）
- API 调用（可能产生费用）

**临时关闭** → `disabled`
- 调试时排查问题
- 某个工具暂时不可用
- 精细控制单个工具

### 批量设置

可以按分类批量设置状态：

```typescript
// 所有写入类工具设为询问模式
setCategoryStatus("write", "ask");

// 所有搜索类工具设为自动模式
setCategoryStatus("search", "auto");

// 临时禁用所有日记工具
setCategoryStatus("journal", "disabled");
```

---

## 工具分类

系统已定义的工具分类：

- **search** - 搜索类（4个工具）
- **read** - 读取类（4个工具）
- **journal** - 日记类（3个工具）
- **write** - 写入类（4个工具）
- **other** - 其他（1个工具）

---

## 配置持久化

工具状态会自动保存到：
1. Orca 插件存储（`orca.plugins.setData`）
2. localStorage（双重保障）

重新打开 AI Chat 时会自动恢复上次的配置。

---

## 总结

三种状态各司其职：

| 状态 | 作用 | 适用场景 |
|------|------|---------|
| **auto** | 直接执行 | 频繁使用的安全操作 |
| **ask** | 询问确认 | 敏感操作、外部调用 |
| **disabled** | 临时禁用 | 调试、精细控制 |

配合全局开关，实现灵活的工具管理！
