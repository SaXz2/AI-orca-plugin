# Skills System Debug Guide

## Current Status

I've enhanced the Skills system with comprehensive debugging to identify why:
1. Created Skills don't appear in the list after creation
2. Some Skills are created without SKILL.md files
3. Only the newly created Skill shows up, others disappear

## Changes Made

### 1. Enhanced Logging in `listSkills()`
Added detailed step-by-step logging to trace exactly what happens when listing skills:
- Shows each entry from `listFiles()`
- Shows normalized path (Windows `\` → `/`)
- Shows whether entry starts with `"skills/"`
- Shows relative path extraction
- Shows path splitting and skill ID extraction

### 2. Enhanced Logging in `createSkill()`
Added verification steps after file creation:
- Logs the content being written
- Verifies the file was written by reading it back
- Checks if the file appears in `listFiles()`
- Provides detailed error messages if any step fails

### 3. Enhanced Logging in `getSkill()`
Added logging to track skill retrieval:
- Shows the path being read
- Shows content size after reading
- Helps identify if SKILL.md files are missing

### 4. Added Delay in Modal's `loadSkillsData()`
Added a 100ms delay before calling `listSkills()` to ensure the file system has flushed changes.

### 5. Disabled `ensureBuiltInSkills()` on Plugin Load
Commented out the built-in skills initialization since the feature is temporarily unavailable.

## How to Debug

### Step 1: Reload the Plugin
1. Open Orca Note
2. Reload the AI Chat plugin (or restart Orca)
3. Open the browser console (F12)

### Step 2: Create a Test Skill
1. Open Skill Manager
2. Click "新建技能" (New Skill)
3. Enter:
   - Name: `TestSkill123`
   - Description: `This is a test skill`
   - Instruction: `# Test\n\nThis is a test.`
4. Click "创建" (Create)

### Step 3: Check Console Output
Look for logs like:
```
[SkillsManager] createSkill() called: skillId=TestSkill123, name=TestSkill123
[SkillsManager] Writing SKILL.md to: skills/TestSkill123/SKILL.md
[SkillsManager] Content length: XXX bytes
[SkillsManager] Successfully wrote SKILL.md
[SkillsManager] Verification passed: SKILL.md exists
[SkillsManager] File appears in listFiles: true
[SkillsManager] Successfully created skill: TestSkill123
```

Then when the modal refreshes:
```
[SkillsManager] listFiles returned N entries: [...]
[SkillsManager] [0] Raw entry: "skills\TestSkill123\SKILL.md"
[SkillsManager] [0] Normalized: "skills/TestSkill123/SKILL.md"
[SkillsManager] [0] Checking if starts with "skills/": true
[SkillsManager] [0] Relative path: "TestSkill123/SKILL.md"
[SkillsManager] [0] Parts: ["TestSkill123", "SKILL.md"]
[SkillsManager] [0] Adding skill ID: "TestSkill123"
[SkillsManager] listSkills() found 1 skills: ["TestSkill123"]
```

### Step 4: Identify Issues

**Issue: `listSkills()` returns 0 skills**
- Check if `listFiles()` is returning entries
- Check if path normalization is working (\ → /)
- Check if the "skills/" prefix check is passing
- Check if parts[0] is being extracted correctly

**Issue: SKILL.md not found**
- Check if `createSkill()` verification step shows "Verification passed"
- Check if "File appears in listFiles" shows true
- If false, the file wasn't actually written

**Issue: Only new skill shows up**
- Check if `listSkills()` is finding all skills
- Check if `getSkill()` is successfully reading each skill
- Check if there are errors in the console

## Expected Behavior

After creating a skill:
1. `createSkill()` writes SKILL.md to `skills/SkillName/SKILL.md`
2. `loadSkillsData()` waits 100ms then calls `listSkills()`
3. `listSkills()` finds all skill folders by parsing file paths
4. `getSkill()` reads each skill's SKILL.md
5. Modal displays all skills in the list

## Common Issues & Solutions

### Issue: Windows Path Separators
**Symptom**: Paths show `\` instead of `/`
**Solution**: Already handled with `.replace(/\\/g, "/")`

### Issue: File System Delay
**Symptom**: Newly created skill doesn't appear immediately
**Solution**: Added 100ms delay in `loadSkillsData()`

### Issue: Empty Skill Folders
**Symptom**: Skill folder exists but SKILL.md is missing
**Solution**: Check `createSkill()` verification logs to see if write failed

### Issue: Orca API Limitations
**Symptom**: Cannot delete empty folders after deleting skill files
**Solution**: This is a known Orca API limitation - `removeFile` only works on files, not directories. Empty folders will remain after deletion. This is expected behavior.

## Next Steps

1. **Reload the plugin** with the new build
2. **Create a test skill** and check the console logs
3. **Share the console output** if issues persist
4. **Check the file system** to verify files are actually being created:
   - Navigate to: `plugin-data/ai-chat/skills/`
   - Verify skill folders and SKILL.md files exist

## Files Modified

- `src/services/skills-manager.ts` - Enhanced logging in listSkills(), createSkill(), getSkill()
- `src/views/SkillManagerModal.tsx` - Added 100ms delay in loadSkillsData()
- `src/main.ts` - Disabled ensureBuiltInSkills() call

## Build Status

✅ Build successful - no TypeScript errors
