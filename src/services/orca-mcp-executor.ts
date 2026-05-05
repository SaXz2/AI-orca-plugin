/**
 * Orca Note MCP 工具执行器
 *
 * 将 12 个 MCP 工具调用映射到现有的 orca.invokeBackend() 和
 * orca.commands.invokeEditorCommand() API 调用。
 * 失败时 fallback 到旧的 executeTool() 实现。
 */

import {
  getTodayJournal,
  queryBlocksAdvanced,
  getCachedTagSchema,
  type SearchResult,
} from "./search-service";
import {
  unwrapBackendResult,
  throwIfBackendError,
  flattenBlockTreeToLines,
  createFlattenState,
  fetchBlockTrees,
} from "../utils/block-utils";
import { safeText } from "../utils/text-utils";
import type { QueryCondition } from "../utils/query-types";

// ─── 辅助函数 ────────────────────────────────────────────────────────────

const MAX_OUTPUT_LENGTH = 30000;

function json(data: unknown): string {
  const s = JSON.stringify(data);
  if (s.length > MAX_OUTPUT_LENGTH) {
    return s.slice(0, MAX_OUTPUT_LENGTH) + `\n... (输出截断, 原 ${s.length} 字符)`;
  }
  return s;
}

function truncateText(text: string, maxLen: number = 2000): string {
  if (!text || text.length <= maxLen) return text || "";
  return text.slice(0, maxLen) + `... (截断, 原 ${text.length} 字符)`;
}

function errorJson(message: string, toolName: string): string {
  return json({ success: false, error: message, tool: toolName });
}

/**
 * 安全调用 invokeGroup，当 API 不可用时自动降级为直接调用
 * 某些 Orca Note 版本未实现 invokeGroup
 */
async function invokeGroup(
  callback: () => Promise<void>,
  _options?: { topGroup?: boolean; undoable?: boolean }
): Promise<void> {
  if (typeof orca.commands?.invokeGroup === "function") {
    return orca.commands.invokeGroup(callback, _options);
  }
  return callback();
}

function formatSearchResults(results: SearchResult[]): string {
  if (!results.length) return json({ success: true, totalCount: 0, results: [], message: "未找到匹配的块" });
  const MAX_RESULT_CONTENT = 1500;
  const MAX_RESULTS = 20;
  const limited = results.slice(0, MAX_RESULTS);
  return json({
    success: true,
    totalCount: results.length,
    shownCount: limited.length,
    truncated: results.length > MAX_RESULTS,
    results: limited.map(r => ({
      id: r.id,
      title: r.title,
      content: truncateText(r.content, MAX_RESULT_CONTENT),
      created: r.created,
      modified: r.modified,
      tags: r.tags,
      propertyValues: r.propertyValues,
    })),
  });
}

// ─── MCP 条件格式 → 内部 QueryCondition 格式转换 ────────────────────────

interface McpDateSpec { t: number; v: number; u?: string }

function mcpDateToQueryDateSpec(d: McpDateSpec | undefined): { type: "relative" | "absolute"; value: number; unit?: "s" | "m" | "h" | "d" | "w" | "M" | "y" } | undefined {
  if (!d) return undefined;
  const unit = d.u as "s" | "m" | "h" | "d" | "w" | "M" | "y" | undefined;
  if (d.t === 1) return { type: "relative", value: d.v, unit };
  if (d.t === 2) return { type: "absolute", value: d.v };
  return undefined;
}

function mcpOpToQueryOp(op: number): string {
  const map: Record<number, string> = { 1: "==", 2: "!=", 3: "includes", 4: "not includes", 5: "includes", 6: "not includes", 7: ">", 8: "<", 9: ">=", 10: "<=", 11: "is null", 12: "not null" };
  return map[op] || "==";
}


function mcpConditionToQueryCondition(cond: any): QueryCondition | null {
  const kind = cond.kind;
  switch (kind) {
    case 3: // Journal
      return { type: "journal", start: mcpDateToQueryDateSpec(cond.start)!, end: mcpDateToQueryDateSpec(cond.end)! };
    case 4: // Tag
      return { type: "tag", name: cond.name, properties: cond.properties?.map((p: any) => ({ name: p.name, op: mcpOpToQueryOp(p.op), value: p.value })) };
    case 6: // Reference
      return { type: "ref", blockId: cond.blockId };
    case 8: // Text
      return { type: "text", text: cond.text, raw: cond.raw };
    case 9: // Block properties
      return { type: "block", hasTags: cond.hasTags, hasParent: cond.hasParent, hasChild: cond.hasChild, hasAliases: cond.hasAliases };
    case 11: // Task
      return { type: "task", completed: cond.completed };
    case 12: // Block Match
      return { type: "blockMatch", blockId: typeof cond.blockId === "string" ? parseInt(cond.blockId, 10) : cond.blockId };
    default:
      return null;
  }
}

/** 将一个 Orca block 对象格式化为文本（含子块） */
function formatBlockText(block: any, children?: any[]): string {
  const lines: string[] = [];
  lines.push(`[Block #${block.id}]`);
  if (block.text) lines.push(safeText(block.text));
  if (block.content && Array.isArray(block.content)) {
    const text = block.content.map((f: any) => f.v ?? "").join("");
    if (text) lines.push(text);
  }
  if (block.aliases?.length) lines.push(`Aliases: ${block.aliases.join(", ")}`);
  if (block.properties?.length) lines.push(`Properties: ${JSON.stringify(block.properties)}`);
  if (children?.length) {
    lines.push(`\n-- Children (${children.length}) --`);
    children.forEach((child: any) => {
      if (child.text) lines.push(`  [${child.id}] ${safeText(child.text)}`);
    });
  }
  return lines.join("\n") || `[Block #${block.id} - empty]`;
}

/** 向上追溯块的页面（查找有 alias 的祖先块） */
async function findBlockPage(blockId: number): Promise<{ pageId: number; pageName: string } | null> {
  try {
    let currentId = blockId;
    const visited = new Set<number>();
    while (currentId && !visited.has(currentId)) {
      visited.add(currentId);
      const block = orca.state.blocks[currentId] || await orca.invokeBackend("get-block", currentId);
      if (!block) break;
      if (block.aliases && block.aliases.length > 0) {
        return { pageId: block.id, pageName: block.aliases[0] };
      }
      currentId = block.parent;
    }
    return null;
  } catch {
    return null;
  }
}

// ─── 重试辅助 ──────────────────────────────────────────────────────────────

const RETRY_DELAY_MS = 300;

const MUTATION_TOOLS = new Set([
  "insert_markdown", "insert_tags", "create_page", "create_tags",
  "move_blocks", "delete_blocks", "remove_tags",
]);

/** 写入类操作失败时自动重试 1 次，缓解块未就绪的竞态问题 */
async function withRetry(fn: () => Promise<string>, toolName: string): Promise<string> {
  try {
    return await fn();
  } catch (err: any) {
    if (MUTATION_TOOLS.has(toolName)) {
      console.warn(`[orca-mcp-executor] ${toolName} 首次失败，300ms 后重试:`, err?.message);
      await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
      return await fn();
    }
    throw err;
  }
}

// ─── 主执行器 ────────────────────────────────────────────────────────────

/**
 * 执行 MCP 工具
 * @param toolName MCP 工具名
 * @param args 工具参数
 * @returns JSON 字符串结果
 */
export async function executeMcpTool(toolName: string, args: any): Promise<string> {
  try {
    const execute = async (): Promise<string> => {
    switch (toolName) {

      // ═══════════════════════════════════════════════════════════════════
      // query_blocks — 高级块查询
      // ═══════════════════════════════════════════════════════════════════
      case "query_blocks": {
        // 兼容两种格式：args.q（扁平）和 args.description.q（嵌套）
        const q = args?.q || args?.description?.q;
        if (!q?.conditions?.length) {
          return errorJson("缺少查询条件 (q.conditions 为空)", toolName);
        }

        // 将 MCP 格式条件 (kind-based) 转换为内部 QueryCondition 格式 (type-based)
        const queryConditions = q.conditions
          .map((c: any) => mcpConditionToQueryCondition(c))
          .filter(Boolean) as QueryCondition[];

        if (!queryConditions.length) {
          return errorJson("没有有效的查询条件", toolName);
        }

        // combineMode: 优先用顶层 combineMode，否则从 q.kind 推断
        const combineMode: "and" | "or" | "chain_and" =
          args?.combineMode === "or" ? "or" :
          q.kind === 101 ? "or" :
          q.kind === 106 ? "chain_and" :
          "and";

        const options: {
          conditions: QueryCondition[];
          combineMode: "and" | "or" | "chain_and";
          pageSize: number;
          page: number;
          sort?: any;
          excludeId?: number;
        } = {
          conditions: queryConditions,
          combineMode,
          pageSize: Math.min(args?.pageSize ?? args?.description?.pageSize ?? 50, 50),
          page: args?.page ?? args?.description?.page ?? 1,
          sort: args?.sort ?? args?.description?.sort,
          excludeId: args?.excludeId ?? args?.description?.excludeId,
        };

        const results = await queryBlocksAdvanced(options);
        return formatSearchResults(results);
      }

      // ═══════════════════════════════════════════════════════════════════
      // get_blocks_text — 获取块文本内容
      // ═══════════════════════════════════════════════════════════════════
      case "get_blocks_text": {
        const blockIds: number[] = args?.blockIds;
        if (!blockIds?.length) {
          return errorJson("缺少 blockIds 参数", toolName);
        }

        const results: any[] = [];
        for (const blockId of blockIds) {
          try {
            let block = orca.state.blocks[blockId];
            if (!block) {
              const result = await orca.invokeBackend("get-block", blockId);
              block = unwrapBackendResult<any>(result);
            }
            if (!block) {
              results.push({ blockId, error: "块未找到" });
              continue;
            }

            const childStart = args?.childStartIndex;
            const childEnd = args?.childEndIndex;
            let children: any[] | undefined;
            if (block.children?.length) {
              const childIds: number[] = childStart != null && childEnd != null
                ? block.children.slice(childStart - 1, childEnd)
                : block.children;
              // 批量加载子块，比逐个 get-block 更高效
              if (childIds.length > 0) {
                try {
                  const blocksResult = await orca.invokeBackend("get-blocks", childIds);
                  const blocksList = unwrapBackendResult<any[]>(blocksResult);
                  children = Array.isArray(blocksList) ? blocksList : [];
                } catch {
                  // 批量加载失败时逐个回退
                  children = [];
                  for (const childId of childIds) {
                    const childBlock = orca.state.blocks[childId] || await orca.invokeBackend("get-block", childId);
                    if (childBlock) children.push(childBlock);
                  }
                }
              }
            }

            results.push({
              blockId: block.id,
              text: truncateText(safeText(block.text ?? ""), 2000),
              aliases: block.aliases,
              children: children?.slice(0, 50).map((c: any) => ({
                blockId: c.id,
                text: truncateText(safeText(c.text ?? ""), 500),
              })),
              childCount: block.children?.length ?? 0,
              childTruncated: (children?.length ?? 0) > 50,
            });
          } catch (e: any) {
            results.push({ blockId, error: e?.message ?? "获取失败" });
          }
        }

        return json({ success: true, blocks: results });
      }

      // ═══════════════════════════════════════════════════════════════════
      // get_page — 查找包含指定块的页面
      // ═══════════════════════════════════════════════════════════════════
      case "get_page": {
        const blockIds: number[] = args?.blockIds;
        if (!blockIds?.length) {
          return errorJson("缺少 blockIds 参数", toolName);
        }

        const pages: any[] = [];
        for (const blockId of blockIds) {
          try {
            const page = await findBlockPage(blockId);
            if (page) {
              pages.push({ blockId, ...page });
            } else {
              pages.push({ blockId, error: "未找到所属页面" });
            }
          } catch (e: any) {
            pages.push({ blockId, error: e?.message ?? "查询失败" });
          }
        }

        return json({ success: true, pages });
      }

      // ═══════════════════════════════════════════════════════════════════
      // get_today_journal — 获取今日日志
      // ═══════════════════════════════════════════════════════════════════
      case "get_today_journal": {
        const result = await getTodayJournal(true);
        return json({
          success: true,
          blockId: result.id,
          date: new Date().toISOString().slice(0, 10),
          title: result.title,
          content: result.content,
          fullContent: result.fullContent,
          tags: result.tags,
        });
      }

      // ═══════════════════════════════════════════════════════════════════
      // get_tags_and_pages — 列出所有标签和页面
      // ═══════════════════════════════════════════════════════════════════
      case "get_tags_and_pages": {
        const pageNum = args?.pageNum ?? 1;
        const pageSize = args?.pageSize ?? 200;

        try {
          // get-aliases 返回 [statusCode, blockIdArray]
          const aliasResult = await orca.invokeBackend("get-aliases", "", 0, Math.max(pageSize, 1000));
          let aliasBlockIds: number[] = [];
          if (Array.isArray(aliasResult) && aliasResult.length === 2 && typeof aliasResult[0] === "number") {
            aliasBlockIds = aliasResult[1] || [];
          }

          if (aliasBlockIds.length === 0) {
            return json({
              success: true,
              pagination: { pageNum, pageSize, totalPages: 0 },
              tags: { total: 0, totalPages: 0, items: [] },
              pages: { total: 0, items: [] },
            });
          }

          // 批量获取别名块
          const blocksResult = await orca.invokeBackend("get-blocks", aliasBlockIds);
          const blocks = Array.isArray(blocksResult) ? blocksResult : [];

          const tagSet = new Set<string>();
          const pages: any[] = [];
          // blockId → properties 映射，用于后续构建 tag schema
          const blockPropsMap = new Map<number, any[]>();

          for (const block of blocks) {
            if (!block) continue;
            const aliases: string[] = block.aliases ?? [];
            for (const alias of aliases) {
              if (typeof alias === "string" && alias.trim() && !alias.startsWith("_")) {
                tagSet.add(alias.trim());
              }
            }
            if (aliases.length > 0) {
              pages.push({
                id: block.id,
                name: aliases[0],
                aliases,
              });
            }
            if (block.properties?.length) {
              blockPropsMap.set(block.id, block.properties);
            }
          }

          // 构建标签列表（含属性定义）
          const tagItems: any[] = [];
          for (const tagName of tagSet) {
            // 尝试从已获取的 block 数据中提取属性定义，避免额外 API 调用
            const pageEntry = pages.find(p => p.name === tagName || p.aliases?.includes(tagName));
            let properties: any[] = [];
            if (pageEntry?.id) {
              const props = blockPropsMap.get(pageEntry.id);
              if (props) {
                properties = props.map((p: any) => ({
                  name: p.name,
                  type: p.type,
                  typeArgs: p.typeArgs,
                }));
              }
            }
            // 如果 block 上没有 properties，尝试从 schema 缓存获取
            if (!properties.length) {
              try {
                const schema = await getCachedTagSchema(tagName);
                properties = schema.properties || [];
              } catch {
                // schema 获取失败，保持空属性列表
              }
            }
            tagItems.push({ name: tagName, properties });
          }

          const total = tagItems.length;
          const start = (pageNum - 1) * pageSize;
          const paginatedTags = tagItems.slice(start, start + pageSize);

          return json({
            success: true,
            pagination: { pageNum, pageSize, totalPages: Math.ceil(total / pageSize) },
            tags: { total, totalPages: Math.ceil(total / pageSize), items: paginatedTags },
            pages: { total: pages.length, items: pages },
          });
        } catch (e: any) {
          return json({ success: false, error: e?.message ?? "获取失败" });
        }
      }

      // ═══════════════════════════════════════════════════════════════════
      // insert_markdown — 解析 Markdown 并插入
      // ═══════════════════════════════════════════════════════════════════
      case "insert_markdown": {
        const refBlockId = args?.refBlockId;
        const position = args?.position ?? "lastChild";
        const text = args?.text;

        if (!refBlockId) return errorJson("缺少 refBlockId 参数", toolName);
        if (!text) return errorJson("缺少 text 参数", toolName);

        const refBlock = orca.state.blocks[refBlockId];
        if (!refBlock) return errorJson(`参考块 #${refBlockId} 未找到`, toolName);

        if (!orca.commands?.invokeEditorCommand) {
          return errorJson("Orca 编辑器命令不可用", toolName);
        }

        let newBlockIds: number[] = [];
        await invokeGroup(async () => {
          newBlockIds = await orca.commands.invokeEditorCommand(
            "core.editor.batchInsertText",
            null, refBlock, position, text, false, false
          );
        }, { topGroup: true, undoable: true });

        return json({
          success: true,
          blockIds: newBlockIds,
          refBlockId,
          position,
          message: `已在 #${refBlockId} 的 ${position} 位置插入内容`,
        });
      }

      // ═══════════════════════════════════════════════════════════════════
      // insert_tags — 批量添加标签
      // ═══════════════════════════════════════════════════════════════════
      case "insert_tags": {
        const blockIds: number[] = args?.blockIds;
        const tags: any[] = args?.tags;

        if (!blockIds?.length) return errorJson("缺少 blockIds 参数", toolName);
        if (!tags?.length) return errorJson("缺少 tags 参数", toolName);

        if (!orca.commands?.invokeEditorCommand) {
          return errorJson("Orca 编辑器命令不可用", toolName);
        }

        const results: any[] = [];
        await invokeGroup(async () => {
          for (const blockId of blockIds) {
            for (const tag of tags) {
              try {
                // 兼容字符串 "tagName" 和对象 {name, props} 两种格式
                const tagName = typeof tag === "string" ? tag : tag?.name;
                if (!tagName) continue;

                if (typeof tag === "object" && tag?.props && Object.keys(tag.props).length > 0) {
                  // 带属性的标签: 转换 Record<string,any> → BlockRefData[]
                  const data = Object.entries(tag.props).map(([name, value]) => ({ name, value }));
                  await orca.commands.invokeEditorCommand(
                    "core.editor.insertTag", null, blockId, tagName, data
                  );
                } else {
                  // 仅标签名
                  await orca.commands.invokeEditorCommand(
                    "core.editor.insertTag", null, blockId, tagName
                  );
                }
                results.push({ blockId, tagName, success: true });
              } catch (e: any) {
                results.push({ blockId, tagName: typeof tag === "string" ? tag : tag?.name, success: false, error: e?.message });
              }
            }
          }
        }, { topGroup: true, undoable: true });

        return json({ success: true, updatedIds: blockIds, results });
      }

      // ═══════════════════════════════════════════════════════════════════
      // create_page — 创建页面
      // ═══════════════════════════════════════════════════════════════════
      case "create_page": {
        const pageName: string = args?.name;
        const includeIn: string[] = args?.includeIn;

        if (!pageName) return errorJson("缺少 name 参数", toolName);
        if (pageName.startsWith("_")) return errorJson("页面名不能以 _ 开头", toolName);

        if (!orca.commands?.invokeEditorCommand) {
          return errorJson("Orca 编辑器命令不可用", toolName);
        }

        try {
          // createAlias 需要 blockId — 先创建一个空 block 再创建 alias
          // 获取今日日志作为父块
          const journal = await getTodayJournal(false);
          if (!journal?.id) return errorJson("无法获取今日日志块", toolName);

          let newBlockId: number;
          await invokeGroup(async () => {
            // 使用 batchInsertText 创建一个段落块
            const blockIds = await orca.commands.invokeEditorCommand(
              "core.editor.batchInsertText",
              null, orca.state.blocks[journal.id], "lastChild",
              pageName, false, false
            );
            newBlockId = blockIds?.[0];
            if (newBlockId) {
              await orca.commands.invokeEditorCommand(
                "core.editor.createAlias", null, pageName, newBlockId, true
              );
            }
          }, { topGroup: true, undoable: true });

          return json({
            success: true,
            blockId: newBlockId!,
            pageName,
            message: `页面「${pageName}」已创建`,
          });
        } catch (e: any) {
          return json({ success: false, error: e?.message ?? "创建失败" });
        }
      }

      // ═══════════════════════════════════════════════════════════════════
      // create_tags — 批量创建标签定义
      // ═══════════════════════════════════════════════════════════════════
      case "create_tags": {
        const tags: any[] = args?.tags;
        if (!tags?.length) return errorJson("缺少 tags 参数", toolName);

        if (!orca.commands?.invokeEditorCommand) {
          return errorJson("Orca 编辑器命令不可用", toolName);
        }

        // 根据 MCP 属性类型生成合理的默认值，用于触发 Orca 自动推断属性类型
        const buildDefaultProps = (properties: any[]): Record<string, any> => {
          const props: Record<string, any> = {};
          for (const prop of properties) {
            if (!prop?.name) continue;
            switch (prop.type) {
              case "text": case "image": case "link": case "place": case "phone": case "email":
                props[prop.name] = ""; break;
              case "number":
                props[prop.name] = 0; break;
              case "boolean":
                props[prop.name] = false; break;
              case "date": case "datetime":
                props[prop.name] = Math.floor(Date.now() / 1000); break;
              case "time":
                props[prop.name] = "00:00"; break;
              case "select":
                props[prop.name] = prop.options?.[0] ?? ""; break;
              case "multi-select":
                props[prop.name] = prop.options?.length ? [prop.options[0]] : []; break;
              case "block-ref":
                props[prop.name] = []; break;
              default:
                props[prop.name] = "";
            }
          }
          return props;
        };

        const results: any[] = [];
        await invokeGroup(async () => {
          for (const tagDef of tags) {
            try {
              if (!tagDef.name) continue;
              if (tagDef.name.startsWith("_")) {
                results.push({ name: tagDef.name, success: false, error: "标签名不能以 _ 开头" });
                continue;
              }

              // 标签通过首次使用自动创建；带属性时传入类型化默认值以触发属性定义
              const journal = await getTodayJournal(false);
              if (journal?.id) {
                const props = tagDef.properties?.length
                  ? buildDefaultProps(tagDef.properties)
                  : undefined;
                // 转换 Record<string,any> → BlockRefData[]
                const data = props ? Object.entries(props).map(([name, value]) => ({ name, value })) : undefined;
                await orca.commands.invokeEditorCommand(
                  "core.editor.insertTag", null, journal.id, tagDef.name, data
                );
              }

              results.push({ name: tagDef.name, success: true, properties: tagDef.properties || [] });
            } catch (e: any) {
              results.push({ name: tagDef.name, success: false, error: e?.message });
            }
          }
        }, { topGroup: true, undoable: true });

        return json({ success: true, results });
      }

      // ═══════════════════════════════════════════════════════════════════
      // move_blocks — 移动块（使用 Orca 原生 core.editor.moveBlocks）
      // ═══════════════════════════════════════════════════════════════════
      case "move_blocks": {
        const blockIds: number[] = args?.blockIds;
        const parentId: number = args?.parentId;
        const leftId: number = args?.leftId;

        if (!blockIds?.length) return errorJson("缺少 blockIds 参数", toolName);
        if (!parentId) return errorJson("缺少 parentId 参数", toolName);

        if (!orca.commands?.invokeEditorCommand) {
          return errorJson("Orca 编辑器命令不可用", toolName);
        }

        try {
          // leftId 存在：移动到指定兄弟块之后
          // 否则：移动为 parentId 的最后一个子块
          const refBlockId = leftId ?? parentId;
          const position = leftId ? "after" : "lastChild";

          await invokeGroup(async () => {
            await orca.commands.invokeEditorCommand(
              "core.editor.moveBlocks",
              null,
              blockIds,
              refBlockId,
              position
            );
          }, { topGroup: true, undoable: true });

          return json({
            success: true,
            movedIds: blockIds,
            parentId,
            message: `已移动 ${blockIds.length} 个块`,
          });
        } catch (e: any) {
          return json({ success: false, error: e?.message ?? "移动失败" });
        }
      }

      // ═══════════════════════════════════════════════════════════════════
      // delete_blocks — 删除块
      // ═══════════════════════════════════════════════════════════════════
      case "delete_blocks": {
        const blockIds: number[] = args?.blockIds;
        if (!blockIds?.length) return errorJson("缺少 blockIds 参数", toolName);

        if (!orca.commands?.invokeEditorCommand) {
          return errorJson("Orca 编辑器命令不可用", toolName);
        }

        // 安全检查：拒绝删除有 alias 的页面块（防止误删整个页面）
        const protectedBlocks: number[] = [];
        for (const blockId of blockIds) {
          const block = orca.state.blocks[blockId];
          if (block?.aliases?.length) {
            protectedBlocks.push(blockId);
          }
        }
        if (protectedBlocks.length > 0) {
          return json({
            success: false,
            error: `以下块是页面/别名块，删除将影响整个页面结构：${protectedBlocks.join(", ")}。如需删除，请直接在编辑器中操作。`,
          });
        }

        try {
          await invokeGroup(async () => {
            await orca.commands.invokeEditorCommand(
              "core.editor.deleteBlocks", null, blockIds
            );
          }, { topGroup: true, undoable: true });
          return json({ success: true, deletedIds: blockIds, message: `已删除 ${blockIds.length} 个块` });
        } catch (e: any) {
          return json({ success: false, error: e?.message ?? "删除失败" });
        }
      }

      // ═══════════════════════════════════════════════════════════════════
      // remove_tags — 移除标签
      // ═══════════════════════════════════════════════════════════════════
      case "remove_tags": {
        const blockIds: number[] = args?.blockIds;
        const tags: string[] = args?.tags;

        if (!blockIds?.length) return errorJson("缺少 blockIds 参数", toolName);
        if (!tags?.length) return errorJson("缺少 tags 参数", toolName);

        if (!orca.commands?.invokeEditorCommand) {
          return errorJson("Orca 编辑器命令不可用", toolName);
        }

        const results: any[] = [];
        await invokeGroup(async () => {
          for (const blockId of blockIds) {
            for (const tagName of tags) {
              try {
                await orca.commands.invokeEditorCommand(
                  "core.editor.removeTag", null,
                  blockId, tagName
                );
                results.push({ blockId, tagName, success: true });
              } catch (e: any) {
                results.push({ blockId, tagName, success: false, error: e?.message });
              }
            }
          }
        }, { topGroup: true, undoable: true });

        return json({ success: true, results });
      }

      default:
        return json({ success: false, error: `未识别的 MCP 工具: ${toolName}` });
    }
    }; // end of execute

    return await withRetry(execute, toolName);
  } catch (error: any) {
    console.error(`[orca-mcp-executor] ${toolName} 执行失败:`, error);
    return json({
      success: false,
      error: error?.message ?? "未知错误",
      tool: toolName,
    });
  }
}

/**
 * 检查是否为 MCP 工具
 */
export function isMcpTool(toolName: string): boolean {
  const mcpTools = [
    "query_blocks", "get_blocks_text", "get_page", "get_today_journal",
    "get_tags_and_pages", "insert_markdown", "insert_tags", "create_page",
    "create_tags", "move_blocks", "delete_blocks", "remove_tags",
  ];
  return mcpTools.includes(toolName);
}
