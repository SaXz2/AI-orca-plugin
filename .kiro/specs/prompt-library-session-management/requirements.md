# Requirements Document

## Introduction

本功能为 AI Chat 插件添加提示词库（Prompt Library）和会话管理（Session Management）功能。提示词库允许用户创建、管理和复用预设的 AI 助手角色和提示词模板。会话管理功能提供更好的对话历史组织和导航能力，包括会话分组、搜索、固定等功能。

## Glossary

- **Prompt_Library**: 提示词库，存储和管理预设助手角色和提示词模板的系统
- **Prompt_Template**: 提示词模板，包含预设的系统提示词、名称、图标等配置的可复用模板
- **Session**: 会话，一次完整的对话上下文，包含多条消息
- **Session_Group**: 会话分组，用于组织和分类会话的标签或文件夹
- **Quick_Phrase**: 快捷短语，用户预设的常用输入文本片段

## Requirements

### Requirement 1: Prompt Template Management

**User Story:** As a user, I want to create and manage prompt templates, so that I can quickly start conversations with pre-configured AI personas.

#### Acceptance Criteria

1. WHEN a user clicks the "Add Template" button THEN the Prompt_Library SHALL display a form to create a new Prompt_Template with name, icon, system prompt, and optional description fields
2. WHEN a user submits a valid Prompt_Template form THEN the Prompt_Library SHALL persist the template to local storage and display it in the template list
3. WHEN a user selects a Prompt_Template from the list THEN the System SHALL apply the template's system prompt to the current or new session
4. WHEN a user edits an existing Prompt_Template THEN the Prompt_Library SHALL update the stored template and reflect changes in the UI
5. WHEN a user deletes a Prompt_Template THEN the Prompt_Library SHALL remove the template from storage and update the template list
6. WHEN the Prompt_Library loads THEN the System SHALL deserialize and display all previously saved Prompt_Templates

### Requirement 2: Template Organization

**User Story:** As a user, I want to organize my prompt templates with tags and search, so that I can quickly find the template I need.

#### Acceptance Criteria

1. WHEN a user assigns tags to a Prompt_Template THEN the Prompt_Library SHALL store the tags and allow filtering by tag
2. WHEN a user searches for templates by name or tag THEN the Prompt_Library SHALL filter and display matching templates in real-time
3. WHEN a user drags a Prompt_Template to reorder THEN the Prompt_Library SHALL persist the new order
4. WHEN displaying templates THEN the Prompt_Library SHALL group templates by their assigned tags with collapsible sections

### Requirement 3: Session List Management

**User Story:** As a user, I want to view and manage my chat sessions, so that I can easily navigate between different conversations.

#### Acceptance Criteria

1. WHEN the chat panel loads THEN the System SHALL display a list of all sessions sorted by last updated time
2. WHEN a user clicks on a session THEN the System SHALL load and display that session's messages
3. WHEN a user creates a new session THEN the System SHALL add it to the session list and set it as active
4. WHEN a user deletes a session THEN the System SHALL remove it from storage and update the session list
5. WHEN a user renames a session THEN the System SHALL update the session name in storage and UI

### Requirement 4: Session Organization

**User Story:** As a user, I want to organize my sessions with pins and groups, so that I can keep important conversations accessible.

#### Acceptance Criteria

1. WHEN a user pins a session THEN the System SHALL move the session to the top of the list and persist the pinned state
2. WHEN a user unpins a session THEN the System SHALL restore the session to its chronological position
3. WHEN a user assigns a session to a Session_Group THEN the System SHALL organize sessions by group in the UI
4. WHEN a user searches sessions by name or content THEN the System SHALL filter and display matching sessions

### Requirement 5: Session Auto-Naming

**User Story:** As a user, I want sessions to be automatically named based on content, so that I can identify conversations without manual naming.

#### Acceptance Criteria

1. WHEN a new session receives its first user message THEN the System SHALL generate a session name from the message content (first 50 characters)
2. WHEN a user enables AI naming THEN the System SHALL use the AI model to generate a descriptive session name after 2 messages
3. WHEN a user manually edits a session name THEN the System SHALL mark the session as manually named and skip auto-naming
4. WHEN auto-naming is in progress THEN the System SHALL display a loading indicator on the session item

### Requirement 6: Quick Phrases

**User Story:** As a user, I want to save and quickly insert frequently used text snippets, so that I can speed up my input.

#### Acceptance Criteria

1. WHEN a user creates a Quick_Phrase THEN the System SHALL store the title and content and display it in the quick phrase list
2. WHEN a user types a trigger character (/) THEN the System SHALL display a popup with matching Quick_Phrases
3. WHEN a user selects a Quick_Phrase from the popup THEN the System SHALL insert the phrase content into the input field
4. WHEN a user edits or deletes a Quick_Phrase THEN the System SHALL update storage and refresh the quick phrase list
5. WHEN a user drags Quick_Phrases to reorder THEN the System SHALL persist the new order

### Requirement 7: Data Persistence

**User Story:** As a user, I want my templates and sessions to persist across app restarts, so that I don't lose my data.

#### Acceptance Criteria

1. WHEN the System stores Prompt_Templates THEN the System SHALL serialize them to JSON and save to Orca's block storage
2. WHEN the System stores Sessions THEN the System SHALL serialize them to JSON and save to Orca's block storage
3. WHEN the System loads on startup THEN the System SHALL deserialize and restore all Prompt_Templates and Sessions
4. WHEN serializing data THEN the System SHALL include version information for future migration support
5. WHEN deserializing data THEN the System SHALL validate the data structure and handle corrupted data gracefully

### Requirement 8: Template Import/Export

**User Story:** As a user, I want to import and export prompt templates, so that I can share templates with others or backup my data.

#### Acceptance Criteria

1. WHEN a user exports a Prompt_Template THEN the System SHALL generate a JSON file containing the template data
2. WHEN a user imports a template JSON file THEN the System SHALL validate and add the template to the Prompt_Library
3. WHEN importing a template with a duplicate name THEN the System SHALL prompt the user to rename or replace
4. WHEN the import file is invalid THEN the System SHALL display an error message and reject the import
