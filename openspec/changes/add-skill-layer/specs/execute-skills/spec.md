## ADDED Requirements
### Requirement: Skill registry
The system SHALL load a combined list of built-in and user-defined skill definitions and expose them to the runtime.

#### Scenario: User-defined skill loaded
- **WHEN** the user saves a valid skill definition
- **THEN** the skill becomes available for selection and execution

### Requirement: Skill storage structure
The system SHALL store skills under a plugin `Skills/` directory with a fixed structure: `Skills/<skillName>/skills.md`, `Skills/<skillName>/Script/`, and `Skills/<skillName>/Data/`.

#### Scenario: Load skills from disk
- **WHEN** the plugin initializes
- **THEN** it scans `Skills/` for valid skill folders and loads each `skills.md`

### Requirement: Plugin-data fallback storage
The system SHALL fall back to plugin data storage when backend file APIs are unavailable, persisting only `skills.md` and skipping `Script/` and `Data/` resources.

#### Scenario: Backend file APIs unavailable
- **WHEN** the plugin cannot access `plugin-fs-*` APIs
- **THEN** it stores and loads skills from `orca.plugins.getData/setData` with `skills.md` content only

### Requirement: Skill import/export
The system SHALL import and export skills as `.zip` bundles using the same `Skills/<skillName>/...` directory layout.

#### Scenario: Export skills to zip
- **WHEN** the user exports selected skills
- **THEN** the plugin generates a `.zip` file containing only the selected skill folders and their resources

### Requirement: Skill confirmation
The system SHALL prompt the user to confirm before executing any skill and show the skill name and step summary.

#### Scenario: User approves a skill
- **WHEN** the model requests a skill call
- **THEN** the UI prompts for confirmation and executes the skill only after approval

#### Scenario: User declines a skill
- **WHEN** the user rejects the confirmation prompt
- **THEN** no underlying tools are executed and the assistant receives a cancellation result

### Requirement: Skill execution
The system SHALL execute skill steps sequentially through existing tool execution functions and aggregate the results.

#### Scenario: Multi-step skill execution
- **WHEN** a skill defines multiple steps
- **THEN** each step runs in order and the aggregated results are returned

### Requirement: Python skill steps
The system SHALL support Python steps with a dual runtime: backend execution when available, otherwise Pyodide via CDN.

#### Scenario: Backend Python available
- **WHEN** a Python step is executed and backend execution is available
- **THEN** the system runs the step via backend Python and returns its output

#### Scenario: Backend Python unavailable
- **WHEN** backend execution is not available
- **THEN** the system loads Pyodide from CDN, installs dependencies via `micropip`, and runs the step

#### Scenario: First Pyodide run
- **WHEN** a Python step executes with Pyodide for the first time
- **THEN** the runtime is loaded and cached in memory before running the step

### Requirement: Default task skills
The system SHALL provide default skills for user-facing tasks, including "今日回顾" and "知识卡片".

#### Scenario: 今日回顾 skill
- **WHEN** the model selects the 今日回顾 skill
- **THEN** the system executes its configured steps and returns a summary result

#### Scenario: 知识卡片 skill
- **WHEN** the model selects the 知识卡片 skill
- **THEN** the system executes its configured steps and returns flashcards or learning prompts
