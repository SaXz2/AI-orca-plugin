## ADDED Requirements
### Requirement: Multi-step skill form editor
The system SHALL allow users to configure multiple tool steps in the simplified skill form editor, including adding, deleting, and reordering steps.

#### Scenario: Reorder tool steps
- **WHEN** the user drags a tool step to a new position
- **THEN** the generated `skills.md` preserves the new step order

#### Scenario: Delete a tool step
- **WHEN** the user removes a tool step
- **THEN** the step is removed from the generated `skills.md`

### Requirement: Localized tool and parameter labels
The system SHALL display user-friendly Chinese labels for tools and parameters in the simplified form editor.

#### Scenario: Tool label display
- **WHEN** the tool list is shown
- **THEN** the editor shows a Chinese label (fallback to the tool description if no label is defined)

#### Scenario: Parameter label display
- **WHEN** a tool parameter is shown
- **THEN** the editor shows a Chinese label derived from the parameter description and a secondary field name
