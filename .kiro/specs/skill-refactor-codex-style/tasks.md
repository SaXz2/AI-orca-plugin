# Implementation Plan

- [-] 1. 定义新的类型和接口



  - [x] 1.1 创建 SkillMetadata 和 SkillDefinition 类型



    - 定义 name (max 64 chars), description (max 1024 chars) 字段
    - 定义 id, instruction, source, createdAt, updatedAt 字段
    - _Requirements: 2.1, 2.2_
  - [ ]* 1.2 编写属性测试：Metadata Validation Correctness
    - **Property 2: Metadata Validation Correctness**
    - **Validates: Requirements 2.1**


- [x] 2. 实现 SKILL.md 解析和序列化




  - [x] 2.1 实现 parseSkillMd 函数


    - 解析 YAML frontmatter 提取 name 和 description
    - 提取 markdown 正文作为 instruction
    - _Requirements: 1.3_
  - [x] 2.2 实现 serializeSkillMd 函数


    - 将 metadata 序列化为 YAML frontmatter
    - 将 instruction 作为 markdown 正文
    - _Requirements: 1.4_
  - [ ]* 2.3 编写属性测试：SKILL.md Round-Trip Consistency
    - **Property 1: SKILL.md Round-Trip Consistency**
    - **Validates: Requirements 1.3, 1.4**


- [x] 3. 实现 IndexedDB 存储层





  - [x] 3.1 创建 SkillStorage 模块

    - 初始化 IndexedDB 数据库和 object store
    - 实现 saveSkill, getSkill, getAllSkills, deleteSkill 函数
    - _Requirements: 1.1, 1.2_
  - [ ]* 3.2 编写属性测试：Skill Storage Persistence
    - **Property 3: Skill Storage Persistence**
    - **Validates: Requirements 1.1, 1.2**


- [x] 4. 重构 SkillService




  - [x] 4.1 更新 loadSkillRegistry 函数


    - 从 IndexedDB 加载所有技能
    - 初始化内置技能（如果不存在）
    - _Requirements: 1.2_

  - [x] 4.2 实现 createSkill 函数

    - 验证 metadata 字段长度
    - 生成唯一 id 并保存到 IndexedDB
    - _Requirements: 1.1, 2.1_

  - [x] 4.3 实现 updateSkill 函数

    - 验证 metadata 并更新 IndexedDB

    - _Requirements: 1.4_
  - [x] 4.4 实现 deleteSkill 函数

    - 从 IndexedDB 删除技能
    - _Requirements: 1.1_

  - [x] 4.5 实现 searchSkills 函数
    - 在 name 和 description 中搜索匹配
    - _Requirements: 5.2_
  - [ ]* 4.6 编写属性测试：Search Result Relevance
    - **Property 4: Search Result Relevance**
    - **Validates: Requirements 5.2**



- [x] 5. 实现导入导出功能

  - [x] 5.1 实现 exportSkill 函数


    - 将技能导出为 SKILL.md 格式字符串
    - _Requirements: 1.4_

  - [x] 5.2 实现 importSkill 函数

    - 解析 SKILL.md 内容并保存到 IndexedDB
    - _Requirements: 1.3_


- [x] 6. 更新 SkillStore





  - [x] 6.1 更新 store 状态结构

    - 使用新的 SkillDefinition 类型
    - _Requirements: 2.1_


- [x] 7. 重构 SkillManagerModal UI




  - [x] 7.1 更新技能列表显示


    - 显示 name 和 description
    - _Requirements: 4.1, 5.1_
  - [x] 7.2 更新技能编辑表单


    - name, description, instruction 三个字段
    - 显示字段长度限制提示
    - _Requirements: 4.1, 4.2_
  - [x] 7.3 实现搜索功能


    - 添加搜索输入框
    - 实时过滤技能列表
    - _Requirements: 5.2_
  - [x] 7.4 实现导入导出按钮


    - 导出为 .md 文件下载
    - 导入 .md 文件
    - _Requirements: 1.3, 1.4_


- [x] 8. 迁移内置技能





  - [x] 8.1 更新内置技能模板

    - 转换为新的 SKILL.md 格式
    - 优化 description 使用 Codex 模板
    - _Requirements: 2.1, 2.2_


- [x] 9. Checkpoint - 确保所有测试通过




  - Ensure all tests pass, ask the user if questions arise.

