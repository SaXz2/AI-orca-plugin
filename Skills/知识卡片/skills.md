---
id: knowledge-cards
name: 知识卡片
description: 从近期日记中提炼知识点并生成卡片。
inputs:
  - name: days
    type: number
    description: 回顾的天数（默认3）
    default: 3
steps:
  - type: tool
    tool: getRecentJournals
    args:
      days: "{{days}}"
      includeChildren: true
---
请从日记中提取关键知识点，并生成 5-8 张卡片。调用 `generateFlashcards` 工具返回卡片。
