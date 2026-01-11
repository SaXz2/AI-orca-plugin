---
id: daily-review
name: 今日回顾
description: 汇总近期日记，整理重点、完成事项和待办。
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
请基于获取的日记内容，输出今日回顾：
- 重点事件（3-5条）
- 完成事项
- 未完成/待办
- 明日关注
