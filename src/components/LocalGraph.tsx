/**
 * Local Graph Component
 * 
 * Displays a force-directed graph showing the relationships between blocks.
 * Similar to Obsidian's local graph view.
 */

import * as d3Force from "d3-force";

const React = window.React as any;
const { createElement, useState, useEffect, useRef, useMemo } = React;

interface GraphNode {
  id: number;
  title: string;
  isCenter: boolean;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
}

interface GraphLink {
  source: number | GraphNode;
  target: number | GraphNode;
}

interface LocalGraphProps {
  blockId: number;
  width?: number;
  height?: number;
}

// Get block title helper
function getBlockTitle(blockId: number): string {
  const block = orca.state.blocks[blockId];
  if (!block) return `Block ${blockId}`;
  
  // Ensure text is a string before splitting
  const rawText = block.text;
  const text = typeof rawText === "string" ? rawText.split("\n")[0]?.trim() || "" : "";
  if (text.length > 30) return text.substring(0, 30) + "...";
  return text || `Block ${blockId}`;
}

// Build graph data from block refs
function buildGraphData(centerBlockId: number): { nodes: GraphNode[]; links: GraphLink[] } {
  const block = orca.state.blocks[centerBlockId];
  if (!block) {
    return { nodes: [], links: [] };
  }

  const nodesMap = new Map<number, GraphNode>();
  const links: GraphLink[] = [];

  // Add center node
  nodesMap.set(centerBlockId, {
    id: centerBlockId,
    title: getBlockTitle(centerBlockId),
    isCenter: true,
  });

  // Add outgoing refs (blocks this block references)
  if (block.refs && Array.isArray(block.refs)) {
    for (const ref of block.refs) {
      const targetId = ref.to;
      if (!nodesMap.has(targetId)) {
        nodesMap.set(targetId, {
          id: targetId,
          title: getBlockTitle(targetId),
          isCenter: false,
        });
      }
      links.push({ source: centerBlockId, target: targetId });
    }
  }

  // Add incoming refs (blocks that reference this block)
  if (block.backRefs && Array.isArray(block.backRefs)) {
    for (const ref of block.backRefs) {
      const sourceId = ref.from;
      if (!nodesMap.has(sourceId)) {
        nodesMap.set(sourceId, {
          id: sourceId,
          title: getBlockTitle(sourceId),
          isCenter: false,
        });
      }
      links.push({ source: sourceId, target: centerBlockId });
    }
  }

  return {
    nodes: Array.from(nodesMap.values()),
    links,
  };
}

export default function LocalGraph({ blockId, width = 300, height = 250 }: LocalGraphProps) {
  const svgRef = useRef(null) as any;
  const [nodes, setNodes] = useState([] as GraphNode[]);
  const [links, setLinks] = useState([] as GraphLink[]);
  const simulationRef = useRef(null) as any;

  // Build graph data
  const graphData = useMemo(() => buildGraphData(blockId), [blockId]);

  // Initialize simulation
  useEffect(() => {
    if (graphData.nodes.length === 0) return;

    // Clone nodes to avoid mutating original data
    const nodesCopy: GraphNode[] = graphData.nodes.map((n: GraphNode) => ({ ...n }));
    const linksCopy: GraphLink[] = graphData.links.map((l: GraphLink) => ({ ...l }));

    // Create force simulation
    const simulation = d3Force.forceSimulation<GraphNode>(nodesCopy)
      .force("link", d3Force.forceLink<GraphNode, GraphLink>(linksCopy)
        .id(d => d.id)
        .distance(60))
      .force("charge", d3Force.forceManyBody().strength(-150))
      .force("center", d3Force.forceCenter(width / 2, height / 2))
      .force("collision", d3Force.forceCollide().radius(25));

    simulationRef.current = simulation;

    // Update state on each tick
    simulation.on("tick", () => {
      setNodes([...nodesCopy]);
      setLinks([...linksCopy]);
    });

    return () => {
      simulation.stop();
    };
  }, [graphData, width, height]);

  // Handle node click - navigate to block
  const handleNodeClick = (nodeId: number) => {
    try {
      orca.nav.openInLastPanel("block", { blockId: nodeId });
    } catch (error) {
      console.error("[LocalGraph] Navigation failed:", error);
    }
  };

  // Node colors
  const getNodeColor = (node: GraphNode) => {
    if (node.isCenter) return "var(--orca-color-primary, #007bff)";
    return "var(--orca-color-text-2, #666)";
  };

  if (graphData.nodes.length === 0) {
    return createElement(
      "div",
      { className: "local-graph-empty" },
      "暂无链接关系"
    );
  }

  return createElement(
    "div",
    { className: "local-graph-container" },
    createElement(
      "svg",
      {
        ref: svgRef,
        width,
        height,
        className: "local-graph-svg",
      },
      // Links
      createElement(
        "g",
        { className: "local-graph-links" },
        ...links.map((link: GraphLink, i: number) => {
          const source = link.source as GraphNode;
          const target = link.target as GraphNode;
          if (!source.x || !source.y || !target.x || !target.y) return null;
          
          return createElement("line", {
            key: `link-${i}`,
            x1: source.x,
            y1: source.y,
            x2: target.x,
            y2: target.y,
            className: "local-graph-link",
          });
        })
      ),
      // Nodes
      createElement(
        "g",
        { className: "local-graph-nodes" },
        ...nodes.map((node: GraphNode) => {
          if (!node.x || !node.y) return null;
          
          return createElement(
            "g",
            {
              key: `node-${node.id}`,
              transform: `translate(${node.x}, ${node.y})`,
              className: "local-graph-node",
              onClick: () => handleNodeClick(node.id),
            },
            // Circle
            createElement("circle", {
              r: node.isCenter ? 8 : 5,
              fill: getNodeColor(node),
              className: "local-graph-circle",
            }),
            // Label
            createElement(
              "text",
              {
                dy: node.isCenter ? -12 : -8,
                textAnchor: "middle",
                className: "local-graph-label",
              },
              node.title
            )
          );
        })
      )
    )
  );
}
