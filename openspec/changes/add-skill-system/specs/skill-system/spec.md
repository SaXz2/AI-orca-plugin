## ADDED Requirements

### Requirement: Skill Definition Storage

The system SHALL support storing Skill definitions as blocks with `#skill` tag in the user's note repository.

Each Skill block SHALL contain child blocks with the following keywords (parsed case-insensitively):
- **类型/Type**: Required. Value MUST be either `tools` or `prompt`
- **描述/Description**: Required. A brief description of what the Skill does
- **提示词/Prompt**: Required for `prompt` type, optional for `tools`. The detailed instructions for AI
- **工具/Tools**: Required for `tools` type. Comma-separated list of tool names (supports both `,` and `，`)
- **变量/Variables**: Optional (V1.1). Comma-separated list of variable names

The parser SHALL support:
- Both `:` and `：` as key-value separators
- Both `,` and `，` as list separators
- Multi-line prompt content (concatenate all text in the child block)

#### Scenario: User creates a prompt-type Skill
- **GIVEN** a user wants to create a translation assistant Skill
- **WHEN** user creates a block with content "翻译助手 #skill" and child blocks:
  - "类型: prompt"
  - "描述: 将内容翻译成目标语言"
  - "提示词: 你是一个专业翻译。请将用户内容翻译成{目标语言}。"
  - "变量: 目标语言"
- **THEN** the system SHALL recognize this as a valid prompt-type Skill
- **AND** the Skill SHALL appear in the Skill picker

#### Scenario: User creates a tools-type Skill
- **GIVEN** a user wants to create a task management Skill
- **WHEN** user creates a block with content "任务管理助手 #skill" and child blocks:
  - "类型: tools"
  - "描述: 帮助用户查询和管理任务"
  - "工具: searchBlocksByTag, queryBlocksByTag, createBlock"
  - "提示词: 当用户询问任务相关问题时，使用这些工具"
- **THEN** the system SHALL recognize this as a valid tools-type Skill
- **AND** only the specified tools SHALL be available when this Skill is active

#### Scenario: Skill parsing with format variations
- **GIVEN** a Skill block using Chinese punctuation "类型：tools" and "工具：searchBlocksByTag，createBlock"
- **WHEN** the system parses the Skill
- **THEN** the system SHALL correctly parse the type as "tools"
- **AND** the system SHALL correctly parse tool names ["searchBlocksByTag", "createBlock"]

#### Scenario: Invalid Skill is silently skipped
- **GIVEN** a Skill block missing the required "类型" field
- **WHEN** the system loads Skills
- **THEN** the invalid Skill SHALL NOT appear in the Skill picker
- **AND** a warning SHALL be logged to console

---

### Requirement: Skill Picker Trigger

The system SHALL provide a slash command interface for selecting Skills.

#### Scenario: User triggers Skill picker with slash at line start
- **GIVEN** user is in the chat input field with empty input
- **WHEN** user types "/" at position 0
- **THEN** the system SHALL display the Skill picker menu
- **AND** the "/" character SHALL NOT be inserted into the input

#### Scenario: User triggers Skill picker after space
- **GIVEN** user has typed "hello " in the input field
- **WHEN** user types "/" after the space
- **THEN** the system SHALL display the Skill picker menu
- **AND** the "/" character SHALL NOT be inserted

#### Scenario: Slash in non-trigger position is normal text
- **GIVEN** user has typed "1" in the input field
- **WHEN** user types "/" to create "1/"
- **THEN** the system SHALL NOT display the Skill picker
- **AND** the "/" character SHALL be inserted normally

#### Scenario: IME composing prevents trigger
- **GIVEN** user is composing Chinese text with IME (isComposing = true)
- **WHEN** user's input sequence includes "/"
- **THEN** the system SHALL NOT trigger the Skill picker

#### Scenario: Skill picker displays available Skills
- **GIVEN** the Skill picker is open
- **WHEN** there are 3 valid Skills defined in user's notes
- **THEN** the menu SHALL display all 3 Skills sorted by name (localeCompare)
- **AND** each item SHALL show the Skill name and description

#### Scenario: Skill picker search filtering
- **GIVEN** the Skill picker is open with 5 Skills
- **WHEN** user types "翻译" in the search
- **THEN** only Skills with names containing "翻译" SHALL be displayed

#### Scenario: No Skills available - empty state
- **GIVEN** the Skill picker is open
- **WHEN** no valid Skills are defined in user's notes
- **THEN** the menu SHALL display: "暂无可用技能"
- **AND** a hint: "在笔记中创建带 #skill 标签的块即可定义技能"

#### Scenario: Keyboard navigation in Skill picker
- **GIVEN** the Skill picker is open with multiple Skills
- **WHEN** user presses ↓ key
- **THEN** the next Skill SHALL be highlighted
- **AND** pressing Enter SHALL select the highlighted Skill
- **AND** pressing Esc SHALL close the picker

---

### Requirement: Skill Chip Display

The system SHALL display the selected Skill as a visual chip in the chat input area.

#### Scenario: Skill selected and chip displayed
- **GIVEN** user selects "翻译助手" from the picker
- **WHEN** the Skill is activated
- **THEN** a chip SHALL appear showing "翻译助手"
- **AND** the chip SHALL have an X button for removal
- **AND** the chip SHALL use ContextChips styling (matching @ context chips)

#### Scenario: Skill chip removal
- **GIVEN** a Skill chip "翻译助手" is displayed
- **WHEN** user clicks the X button on the chip
- **THEN** the Skill SHALL be deactivated
- **AND** the chip SHALL be removed
- **AND** the input text content SHALL be preserved

#### Scenario: Only one Skill active at a time
- **GIVEN** Skill "翻译助手" is currently active
- **WHEN** user types "/" and selects "任务管理助手"
- **THEN** "翻译助手" SHALL be replaced by "任务管理助手"
- **AND** only one Skill chip SHALL be visible

#### Scenario: Input content preserved when switching Skills
- **GIVEN** Skill "翻译助手" is active and input contains "Hello world"
- **WHEN** user types "/" and selects "任务管理助手"
- **THEN** the input SHALL still contain "Hello world"

---

### Requirement: Dynamic System Prompt Injection

The system SHALL dynamically inject Skill instructions into the System Prompt.

#### Scenario: Message sent without Skill
- **GIVEN** no Skill is selected
- **WHEN** user sends a message
- **THEN** the system SHALL use the full default System Prompt
- **AND** all tools SHALL be available

#### Scenario: Message sent with prompt-type Skill
- **GIVEN** prompt-type Skill "翻译助手" is selected with prompt "你是专业翻译..."
- **WHEN** user sends a message
- **THEN** the System Prompt SHALL be: {DEFAULT_PROMPT} + "---\n## 当前激活技能: 翻译助手\n{description}\n\n{skillPrompt}"
- **AND** all tools SHALL remain available

#### Scenario: Message sent with tools-type Skill
- **GIVEN** tools-type Skill "任务管理助手" is selected with tools: ["searchBlocksByTag", "createBlock"]
- **WHEN** user sends a message
- **THEN** the System Prompt SHALL include the Skill's prompt appended to default
- **AND** only tools ["searchBlocksByTag", "createBlock"] SHALL be passed to API
- **AND** other tools (e.g., "getPage") SHALL NOT be available

#### Scenario: Tool name normalization
- **GIVEN** a tools-type Skill specifies tool "getTagSchema" (camelCase)
- **WHEN** the system filters tools
- **THEN** the system SHALL recognize it as "get_tag_schema" (actual tool name)
- **AND** the tool SHALL be included in the filtered set

#### Scenario: Invalid tool names are warned
- **GIVEN** a tools-type Skill specifies tool "nonExistentTool"
- **WHEN** the system filters tools
- **THEN** a warning SHALL be logged: "Unknown tool: nonExistentTool"
- **AND** the tool SHALL be ignored

#### Scenario: All tool names invalid - fallback to full tools
- **GIVEN** a tools-type Skill specifies only invalid tool names
- **WHEN** the system filters tools
- **THEN** the system SHALL fall back to the full tool set
- **AND** a warning SHALL be logged

---

### Requirement: Multi-round Tool Calling Consistency

The system SHALL use consistent tool filtering across all API calls in a conversation turn.

#### Scenario: Tools filtered consistently in multi-round
- **GIVEN** tools-type Skill with tools: ["searchBlocksByTag", "queryBlocksByTag"]
- **WHEN** AI requests multiple rounds of tool calls
- **THEN** each round SHALL only have access to the filtered tools
- **AND** the tool set SHALL NOT change between rounds

---

### Requirement: Skill Variable Support (V1.1)

The system SHALL support variable placeholders in Skill prompts.

#### Scenario: Skill with variables - value provided before send
- **GIVEN** a Skill with variable `{目标语言}` in its prompt
- **WHEN** user clicks send with variable value "英语" already set
- **THEN** the system SHALL replace `{目标语言}` with "英语" in the System Prompt
- **AND** the message SHALL be sent

#### Scenario: Skill with variables - value missing on send
- **GIVEN** a Skill with variable `{目标语言}` in its prompt
- **AND** user has not set a value for the variable
- **WHEN** user clicks send
- **THEN** the system SHALL display a variable input dialog
- **AND** the message SHALL NOT be sent until variable is filled

#### Scenario: Variable dialog cancelled
- **GIVEN** variable input dialog is displayed
- **WHEN** user cancels the dialog
- **THEN** the message SHALL NOT be sent
- **AND** the input text SHALL be preserved

#### Scenario: Variable values persist within session
- **GIVEN** user filled variable `{目标语言}` = "英语"
- **WHEN** user sends another message with the same Skill
- **THEN** the variable value "英语" SHALL be reused
- **AND** no dialog SHALL appear

#### Scenario: Variable values reset on new session
- **GIVEN** user filled variable `{目标语言}` = "英语"
- **WHEN** user starts a new chat session
- **THEN** the variable value SHALL be cleared
- **AND** user will need to fill it again

---

### Requirement: Skill Loading Performance

The system SHALL load Skills efficiently.

#### Scenario: Skills loaded on first picker open
- **GIVEN** user has not opened the Skill picker in this session
- **WHEN** user types "/" to open the picker
- **THEN** the system SHALL load all Skills from notes
- **AND** a loading indicator MAY be shown briefly

#### Scenario: Skills cached within session
- **GIVEN** Skills have been loaded in this session
- **WHEN** user opens the Skill picker again
- **THEN** the system SHALL use cached Skills
- **AND** no additional API calls SHALL be made

#### Scenario: Cache refreshed on new session
- **GIVEN** Skills were cached in previous session
- **WHEN** user opens a new chat session (new panel or "New Chat")
- **THEN** the system SHALL reload Skills from notes
