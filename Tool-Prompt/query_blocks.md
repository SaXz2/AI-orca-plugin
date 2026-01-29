# query_blocks - 高级组合查询

## 功能
使用 QueryDescription2 格式执行复杂的组合查询，支持多条件、日期范围、任务状态等。

## 查询结构

### 查询组类型（kind）
- `100`: SELF_AND - 所有条件必须匹配
- `101`: SELF_OR - 至少一个条件匹配
- `106`: CHAIN_AND - 条件在祖先/后代块中匹配

### 条件类型（kind）
- `3`: 日记查询 - 按日期范围匹配
- `4`: 标签查询 - 按标签和属性匹配
- `6`: 引用查询 - 按引用关系匹配
- `8`: 文本查询 - 按文本内容匹配
- `9`: 块查询 - 按块属性匹配
- `11`: 任务查询 - 按任务完成状态匹配
- `12`: 块匹配 - 按块ID匹配

## 日期格式
- 相对日期：`{"t": 1, "v": -7, "u": "d"}` (7天前)
- 绝对日期：`{"t": 2, "v": 1640995200000}` (时间戳)
- 单位：s=秒, m=分, h=时, d=天, w=周, M=月, y=年

## 操作符（op）
- 1: 等于, 2: 不等于, 3: 包含, 4: 不包含
- 5: 有, 6: 没有, 7: 大于, 8: 小于
- 9: 大于等于, 10: 小于等于, 11: 为空, 12: 不为空

## 使用示例

### 1. AND查询（多条件同时满足）
```json
{"q": {"kind": 100, "conditions": [{"kind": 4, "name": "project"}, {"kind": 8, "text": "deadline"}]}}
```

### 2. OR查询（任一条件满足）
```json
{"q": {"kind": 100, "conditions": [{"kind": 101, "conditions": [{"kind": 4, "name": "urgent"}, {"kind": 4, "name": "important"}]}]}}
```

### 3. 日期范围查询
```json
{"q": {"kind": 100, "conditions": [{"kind": 3, "start": {"t": 1, "v": -7, "u": "d"}, "end": {"t": 1, "v": 0, "u": "d"}}]}}
```

### 4. 标签属性查询
```json
{"q": {"kind": 100, "conditions": [{"kind": 4, "name": "task", "properties": [{"name": "priority", "op": 1, "value": "high"}]}]}}
```

### 5. 未完成任务
```json
{"q": {"kind": 100, "conditions": [{"kind": 11, "completed": false}]}}
```

### 6. 链式查询（祖先/后代）
```json
{"q": {"kind": 100, "conditions": [{"kind": 106, "conditions": [{"kind": 8, "text": "project"}]}, {"kind": 8, "text": "deadline"}]}}
```

## 排序和分页
- sort: `[["_created", "DESC"], ["_text", "ASC"]]`
- 内置字段：_created, _modified, _text, _journal, _refcount
- page: 从1开始
- pageSize: 默认20，最大50

## 何时使用
- 简单查询用其他工具解决不了时
- 需要多条件组合查询
- 需要日期范围筛选
- 需要任务状态筛选
