import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as d3 from "d3";
import { type TagCoOccurrence, type TagColorNamespaceResponse, type TagStatResponse } from "@tagstudio/api-client";
import {
  ChevronDown,
  ChevronUp,
  CircleDot,
  Eye,
  EyeOff,
  Focus,
  Maximize2,
  Minus,
  Plus,
  RotateCcw,
  Settings2,
  Sliders,
  Sparkles
} from "lucide-react";

import { createTagColorLookup } from "@/lib/tag-styles";

type TagGraphViewProps = {
  tags: TagStatResponse[];
  coOccurrences: TagCoOccurrence[];
  selectedTagIds: Set<number>;
  selectionMode?: "AND" | "OR";
  coOccurringTagIds: Set<number>;
  tagColors: TagColorNamespaceResponse[] | undefined;
  onToggleTag: (tagId: number) => void;
};

interface GraphNode extends d3.SimulationNodeDatum {
  id: number;
  name: string;
  entry_count: number;
  total_entry_count: number;
  color_primary: string;
  color_accent: string;
  baseRadius: number;
}

interface GraphLink extends d3.SimulationLinkDatum<GraphNode> {
  source: number | GraphNode;
  target: number | GraphNode;
  shared_count: number;
  value: number;
  /** Normalized strength 0..1 for visual encoding */
  normalizedStrength: number;
  isParentChild?: boolean;
}

function getLinkId(node: number | GraphNode): number {
  return typeof node === "object" ? node.id : node;
}

/** Check if a tag is a system tag by name convention */
function isSystemTag(name: string): boolean {
  return name.startsWith("system:") || name === "System";
}

export function TagGraphView({
  tags,
  coOccurrences,
  selectedTagIds,
  selectionMode = "AND",
  tagColors,
  onToggleTag
}: TagGraphViewProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Controls State
  const [minSharedCount, setMinSharedCount] = useState(1);
  const [nodeScale, setNodeScale] = useState(1.0);
  const [repulsion, setRepulsion] = useState(350);
  const [semanticZoom, setSemanticZoom] = useState(false);
  const [hoveredTagId, setHoveredTagId] = useState<number | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [hideSystemTags, setHideSystemTags] = useState(true);
  // Focus mode: recalculate graph to only show selected nodes + their neighbors
  const [focusMode, setFocusMode] = useState(false);

  const colorLookup = useMemo(() => createTagColorLookup(tagColors), [tagColors]);
  const currentTransformRef = useRef<d3.ZoomTransform>(d3.zoomIdentity);
  const simulationRef = useRef<d3.Simulation<GraphNode, GraphLink> | null>(null);
  const onToggleTagRef = useRef(onToggleTag);
  onToggleTagRef.current = onToggleTag;
  const zoomBehaviorRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);

  // Top tags for graph layout, filtered and capped at 150
  const graphTags = useMemo(() => {
    let filtered = [...tags];
    if (hideSystemTags) {
      filtered = filtered.filter((t) => !isSystemTag(t.name));
    }
    return filtered
      .sort((a, b) => b.entry_count - a.entry_count)
      .slice(0, 150);
  }, [tags, hideSystemTags]);

  const tagIdSet = useMemo(() => new Set(graphTags.map((t) => t.id)), [graphTags]);

  // Build pairwise co-occurrence lookup map: tagId -> Map<otherTagId, sharedCount>
  const coOccurrencePairMap = useMemo(() => {
    const map = new Map<number, Map<number, number>>();
    for (const co of coOccurrences) {
      if (!map.has(co.tag_id_a)) map.set(co.tag_id_a, new Map());
      if (!map.has(co.tag_id_b)) map.set(co.tag_id_b, new Map());
      map.get(co.tag_id_a)!.set(co.tag_id_b, co.shared_count);
      map.get(co.tag_id_b)!.set(co.tag_id_a, co.shared_count);
    }
    return map;
  }, [coOccurrences]);

  // Build full adjacency map (co-occurrences + parent/child hierarchy) for focus mode & neighbor queries
  const fullAdjacencyMap = useMemo(() => {
    const adj = new Map<number, Set<number>>();
    for (const co of coOccurrences) {
      if (tagIdSet.has(co.tag_id_a) && tagIdSet.has(co.tag_id_b)) {
        if (!adj.has(co.tag_id_a)) adj.set(co.tag_id_a, new Set());
        if (!adj.has(co.tag_id_b)) adj.set(co.tag_id_b, new Set());
        adj.get(co.tag_id_a)!.add(co.tag_id_b);
        adj.get(co.tag_id_b)!.add(co.tag_id_a);
      }
    }

    // Include direct parent-child relationships
    for (const tag of graphTags) {
      for (const parentId of tag.parent_ids) {
        if (tagIdSet.has(parentId)) {
          if (!adj.has(tag.id)) adj.set(tag.id, new Set());
          if (!adj.has(parentId)) adj.set(parentId, new Set());
          adj.get(tag.id)!.add(parentId);
          adj.get(parentId)!.add(tag.id);
        }
      }
    }
    return adj;
  }, [coOccurrences, tagIdSet, graphTags]);

  // When focus mode is on and tags are selected, compute the subset of tag IDs to show
  const focusSubsetIds = useMemo(() => {
    if (!focusMode || selectedTagIds.size === 0) return null;

    const subset = new Set<number>();
    // Always include selected tags themselves
    for (const id of selectedTagIds) {
      if (tagIdSet.has(id)) {
        subset.add(id);
      }
    }

    // For all other tags in graphTags, check connectivity based on selectionMode
    for (const tag of graphTags) {
      if (selectedTagIds.has(tag.id)) continue;

      if (selectionMode === "AND") {
        let connectedToAll = true;
        for (const selId of selectedTagIds) {
          if (!fullAdjacencyMap.get(selId)?.has(tag.id)) {
            connectedToAll = false;
            break;
          }
        }
        if (connectedToAll) {
          subset.add(tag.id);
        }
      } else {
        let connectedToAny = false;
        for (const selId of selectedTagIds) {
          if (fullAdjacencyMap.get(selId)?.has(tag.id)) {
            connectedToAny = true;
            break;
          }
        }
        if (connectedToAny) {
          subset.add(tag.id);
        }
      }
    }

    return subset;
  }, [focusMode, selectedTagIds, tagIdSet, fullAdjacencyMap, graphTags, selectionMode]);

  // The actual tags to render in the graph (either full set or focus subset)
  const renderedTags = useMemo(() => {
    if (focusSubsetIds) {
      return graphTags.filter((t) => focusSubsetIds.has(t.id));
    }
    return graphTags;
  }, [graphTags, focusSubsetIds]);

  const renderedTagIdSet = useMemo(() => new Set(renderedTags.map((t) => t.id)), [renderedTags]);

  const { nodes, links, adjacencyMap } = useMemo(() => {
    const tagMap = new Map(renderedTags.map((t) => [t.id, t]));

    // Helper to calculate context-aware display count for each tag
    const getContextCount = (tag: TagStatResponse): number => {
      if (focusMode && focusSubsetIds && !selectedTagIds.has(tag.id)) {
        const sharedCounts: number[] = [];
        for (const selId of selectedTagIds) {
          let count = coOccurrencePairMap.get(tag.id)?.get(selId) ?? 0;
          if (count === 0 && (tag.parent_ids.includes(selId) || tagMap.get(selId)?.parent_ids.includes(tag.id))) {
            count = tag.entry_count;
          }
          sharedCounts.push(count);
        }

        if (selectionMode === "AND") {
          const minShared = sharedCounts.length > 0 ? Math.min(...sharedCounts) : 0;
          return Math.min(tag.entry_count, minShared);
        } else {
          const totalShared = sharedCounts.reduce((acc, c) => acc + c, 0);
          return Math.min(tag.entry_count, Math.max(1, totalShared));
        }
      }
      return tag.entry_count;
    };

    let maxCount = 0;
    for (const tag of renderedTags) {
      const count = getContextCount(tag);
      if (count > maxCount) maxCount = count;
    }

    // Use log-scale for node sizing — spreads values much more evenly
    const logMax = Math.log(maxCount + 1);
    const nodeList: GraphNode[] = renderedTags.map((tag) => {
      const colorDef = tag.color_namespace && tag.color_slug
        ? colorLookup.get(`${tag.color_namespace}/${tag.color_slug}`)
        : undefined;

      const primary = colorDef?.primary ?? "#64748b";
      const accent = colorDef?.secondary ?? colorDef?.primary ?? "#3b82f6";

      const displayCount = getContextCount(tag);

      // Log-scale ratio: spreads values evenly across the dynamic range
      const logRatio = logMax > 0 ? Math.log(displayCount + 1) / logMax : 0.5;
      // Base range: 5px (smallest) to 25px (largest)
      const baseRadius = 5 + logRatio * 20;

      return {
        id: tag.id,
        name: tag.name,
        entry_count: displayCount,
        total_entry_count: tag.entry_count,
        color_primary: primary,
        color_accent: accent,
        baseRadius
      };
    });

    // Build links and find max shared_count for normalization
    const rawLinks: { source: number; target: number; shared_count: number; isParentChild: boolean }[] = [];
    let maxShared = 0;
    const adj = new Map<number, Set<number>>();
    const existingPairs = new Set<string>();

    for (const co of coOccurrences) {
      if (
        renderedTagIdSet.has(co.tag_id_a) &&
        renderedTagIdSet.has(co.tag_id_b) &&
        co.shared_count >= minSharedCount
      ) {
        const pairKey = co.tag_id_a < co.tag_id_b ? `${co.tag_id_a}-${co.tag_id_b}` : `${co.tag_id_b}-${co.tag_id_a}`;
        existingPairs.add(pairKey);

        rawLinks.push({
          source: co.tag_id_a,
          target: co.tag_id_b,
          shared_count: co.shared_count,
          isParentChild: false
        });
        if (co.shared_count > maxShared) maxShared = co.shared_count;

        if (!adj.has(co.tag_id_a)) adj.set(co.tag_id_a, new Set());
        if (!adj.has(co.tag_id_b)) adj.set(co.tag_id_b, new Set());
        adj.get(co.tag_id_a)!.add(co.tag_id_b);
        adj.get(co.tag_id_b)!.add(co.tag_id_a);
      }
    }

    // Add direct parent-child structural links
    for (const tag of renderedTags) {
      for (const parentId of tag.parent_ids) {
        if (renderedTagIdSet.has(parentId)) {
          const pairKey = tag.id < parentId ? `${tag.id}-${parentId}` : `${parentId}-${tag.id}`;
          if (!existingPairs.has(pairKey)) {
            existingPairs.add(pairKey);
            const pcCount = Math.max(1, tag.entry_count);
            rawLinks.push({
              source: parentId,
              target: tag.id,
              shared_count: pcCount,
              isParentChild: true
            });
            if (pcCount > maxShared) maxShared = pcCount;
          }

          if (!adj.has(tag.id)) adj.set(tag.id, new Set());
          if (!adj.has(parentId)) adj.set(parentId, new Set());
          adj.get(tag.id)!.add(parentId);
          adj.get(parentId)!.add(tag.id);
        }
      }
    }

    // Normalize strength for visual encoding
    const sqrtMax = Math.sqrt(maxShared);
    const linkList: GraphLink[] = rawLinks.map((r) => ({
      source: r.source,
      target: r.target,
      shared_count: r.shared_count,
      value: r.shared_count,
      normalizedStrength: sqrtMax > 0 ? Math.sqrt(r.shared_count) / sqrtMax : 0,
      isParentChild: r.isParentChild
    }));

    return { nodes: nodeList, links: linkList, adjacencyMap: adj };
  }, [
    renderedTags,
    colorLookup,
    coOccurrences,
    renderedTagIdSet,
    minSharedCount,
    focusMode,
    focusSubsetIds,
    selectedTagIds,
    coOccurrencePairMap,
    selectionMode
  ]);

  // Compute active focus nodes (selected tag IDs, or hovered tag ID if nothing is selected)
  const { focusTagIds, connectedNeighborIds } = useMemo(() => {
    const focus = new Set<number>();
    if (selectedTagIds.size > 0) {
      for (const id of selectedTagIds) {
        if (renderedTagIdSet.has(id)) focus.add(id);
      }
    } else if (hoveredTagId !== null && renderedTagIdSet.has(hoveredTagId)) {
      focus.add(hoveredTagId);
    }

    const connected = new Set<number>();

    if (selectedTagIds.size > 0) {
      for (const tag of renderedTags) {
        if (selectedTagIds.has(tag.id)) continue;

        if (selectionMode === "AND") {
          let connectedToAll = true;
          for (const selId of selectedTagIds) {
            if (!adjacencyMap.get(selId)?.has(tag.id)) {
              connectedToAll = false;
              break;
            }
          }
          if (connectedToAll) {
            connected.add(tag.id);
          }
        } else {
          let connectedToAny = false;
          for (const selId of selectedTagIds) {
            if (adjacencyMap.get(selId)?.has(tag.id)) {
              connectedToAny = true;
              break;
            }
          }
          if (connectedToAny) {
            connected.add(tag.id);
          }
        }
      }
    } else if (hoveredTagId !== null) {
      const neighbors = adjacencyMap.get(hoveredTagId);
      if (neighbors) {
        for (const neighborId of neighbors) {
          if (neighborId !== hoveredTagId) {
            connected.add(neighborId);
          }
        }
      }
    }

    return { focusTagIds: focus, connectedNeighborIds: connected };
  }, [selectedTagIds, hoveredTagId, renderedTagIdSet, renderedTags, adjacencyMap, selectionMode]);

  // Apply semantic constant-size scaling to nodes/links based on current zoom scale k and nodeScale
  const applyScaling = useCallback((k: number, scale: number, isSemantic: boolean) => {
    if (!svgRef.current) return;
    const svg = d3.select(svgRef.current);
    const effectiveScale = isSemantic ? (scale / k) : scale;
    const strokeScale = isSemantic ? (1 / k) : 1;

    svg.selectAll<SVGCircleElement, GraphNode>(".graph-node-circle")
      .attr("r", (d) => d.baseRadius * effectiveScale)
      .attr("stroke-width", strokeScale * 1.5);

    svg.selectAll<SVGCircleElement, GraphNode>(".graph-node-halo-selected")
      .attr("r", (d) => (d.baseRadius * effectiveScale) + (5 * strokeScale))
      .attr("stroke-width", 3 * strokeScale);

    svg.selectAll<SVGCircleElement, GraphNode>(".graph-node-halo-connected")
      .attr("r", (d) => (d.baseRadius * effectiveScale) + (4 * strokeScale))
      .attr("stroke-width", 2.5 * strokeScale);

    svg.selectAll<SVGTextElement, GraphNode>(".graph-node-label")
      .attr("dy", (d) => (d.baseRadius * effectiveScale) + (13 * strokeScale))
      .attr("font-size", `${Math.max(9, 11 * strokeScale)}px`);

    svg.selectAll<SVGTextElement, GraphNode>(".graph-node-count")
      .attr("font-size", `${Math.max(7, 9 * strokeScale)}px`)
      .attr("dy", `${3 * strokeScale}px`);

    svg.selectAll<SVGLineElement, GraphLink>(".graph-link")
      .attr("stroke-width", (d) => {
        // Sqrt-scale from 0.5px to 6px
        const baseW = 0.5 + d.normalizedStrength * 5.5;
        return baseW * strokeScale;
      });
  }, []);

  // Effect 1: Initialize SVG Graph & Force Simulation ONCE when graph topology changes
  useEffect(() => {
    if (!svgRef.current || !containerRef.current) return;

    const width = containerRef.current.clientWidth || 600;
    const height = containerRef.current.clientHeight || 500;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const g = svg.append("g").attr("class", "tag-graph-root");

    // Setup Zoom
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.05, 10])
      .on("zoom", (event) => {
        currentTransformRef.current = event.transform;
        g.attr("transform", event.transform);
        applyScaling(event.transform.k, nodeScale, semanticZoom);
      });

    svg.call(zoom);
    zoomBehaviorRef.current = zoom;

    // Apply a default zoomed-out initial transform so the graph isn't filling the viewport
    // For focus mode with fewer nodes, zoom in more; for full graph zoom out
    const nodeCount = nodes.length;
    const initialScale = nodeCount < 30 ? 0.9 : nodeCount < 80 ? 0.65 : 0.5;
    const initialTransform = d3.zoomIdentity
      .translate(width * (1 - initialScale) / 2, height * (1 - initialScale) / 2)
      .scale(initialScale);

    svg.call(zoom.transform, initialTransform);
    currentTransformRef.current = initialTransform;

    // Build set of connected node IDs for radial force
    const connectedNodeIds = new Set<number>();
    for (const link of links) {
      const srcId = typeof link.source === "object" ? link.source.id : link.source;
      const tgtId = typeof link.target === "object" ? link.target.id : link.target;
      connectedNodeIds.add(srcId);
      connectedNodeIds.add(tgtId);
    }

    // Improved force simulation for better clustering
    const simulation = d3.forceSimulation<GraphNode>(nodes)
      .force(
        "link",
        d3.forceLink<GraphNode, GraphLink>(links)
          .id((d) => d.id)
          // Strongly associated tags pulled much closer (down to 40px)
          .distance((d) => Math.max(40, 160 - Math.sqrt(d.shared_count) * 12))
          // Stronger pull for high co-occurrence
          .strength((d) => Math.min(0.8, 0.15 + Math.sqrt(d.shared_count) * 0.04))
      )
      // Dynamic charge repulsion
      .force("charge", d3.forceManyBody().strength(-repulsion))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collision", d3.forceCollide<GraphNode>().radius((d) => (d.baseRadius * nodeScale) + 8).strength(0.9))
      // Push disconnected/weakly-connected nodes to the periphery
      .force("radial", d3.forceRadial<GraphNode>(
        (d) => connectedNodeIds.has(d.id) ? 0 : Math.max(width, height) * 0.35,
        width / 2,
        height / 2
      ).strength((d) => connectedNodeIds.has(d.id) ? 0 : 0.04))
      .velocityDecay(0.55)
      .alphaDecay(0.03);

    simulationRef.current = simulation;

    // Links group
    const linkGroup = g.append("g").attr("class", "links");
    const link = linkGroup
      .selectAll<SVGLineElement, GraphLink>("line")
      .data(links)
      .enter()
      .append("line")
      .attr("class", (d) => `graph-link${d.isParentChild ? " graph-link-hierarchy" : ""}`)
      .attr("stroke", "currentColor")
      .attr("stroke-dasharray", (d) => (d.isParentChild ? "4 3" : null))
      // Opacity proportional to strength
      .attr("stroke-opacity", (d) => (d.isParentChild ? 0.25 : 0.06 + d.normalizedStrength * 0.35));

    // Drag behavior
    const drag = d3.drag<SVGGElement, GraphNode>()
      .on("start", (event, d) => {
        if (!event.active) simulation.alphaTarget(0.25).restart();
        d.fx = d.x;
        d.fy = d.y;
      })
      .on("drag", (event, d) => {
        d.fx = event.x;
        d.fy = event.y;
      })
      .on("end", (event, d) => {
        if (!event.active) simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
      });

    // Nodes group
    const nodeGroup = g.append("g").attr("class", "nodes");
    const node = nodeGroup
      .selectAll<SVGGElement, GraphNode>("g")
      .data(nodes)
      .enter()
      .append("g")
      .attr("class", "graph-node-group")
      .attr("data-id", (d) => d.id)
      .style("cursor", "pointer")
      .call(drag as unknown as (selection: d3.Selection<SVGGElement, GraphNode, SVGGElement, unknown>) => void)
      .on("mouseenter", (_, d) => {
        setHoveredTagId(d.id);
      })
      .on("mouseleave", () => {
        setHoveredTagId(null);
      })
      .on("click", (event, d) => {
        event.stopPropagation();
        onToggleTagRef.current(d.id);
      });

    // Selected Halo (Blue dashed glow)
    node.append("circle")
      .attr("class", "graph-node-halo-selected")
      .attr("fill", "none")
      .attr("stroke", "#3b82f6")
      .attr("stroke-dasharray", "4 2")
      .style("display", "none");

    // Connected Subgraph Halo (Amber glow for connected neighbors of selected tags)
    node.append("circle")
      .attr("class", "graph-node-halo-connected")
      .attr("fill", "none")
      .attr("stroke", "#f59e0b")
      .attr("opacity", 0.9)
      .style("display", "none");

    // Node Circle
    node.append("circle")
      .attr("class", "graph-node-circle")
      .attr("fill", (d) => d.color_primary)
      .attr("stroke", (d) => d.color_accent)
      .attr("filter", "drop-shadow(0 2px 4px rgba(0,0,0,0.18))");

    // Node Label
    node.append("text")
      .attr("class", "graph-node-label")
      .text((d) => d.name)
      .attr("text-anchor", "middle")
      .attr("fill", "currentColor")
      .attr("pointer-events", "none")
      .style("text-shadow", "0 1px 3px rgba(0,0,0,0.5)");

    // Count inside circle — show for nodes with radius >= 8
    node.filter((d) => d.baseRadius >= 8)
      .append("text")
      .attr("class", "graph-node-count")
      .text((d) => d.entry_count)
      .attr("text-anchor", "middle")
      .attr("font-weight", "600")
      .attr("fill", "#ffffff")
      .attr("pointer-events", "none");

    // Tooltip
    node.append("title")
      .text((d) => {
        if (focusMode && focusSubsetIds && !selectedTagIds.has(d.id)) {
          return `${d.name} (${d.entry_count} shared with selection / ${d.total_entry_count} total)`;
        }
        return `${d.name} (${d.entry_count} entries)`;
      });

    simulation.on("tick", () => {
      link
        .attr("x1", (d) => (d.source as GraphNode).x!)
        .attr("y1", (d) => (d.source as GraphNode).y!)
        .attr("x2", (d) => (d.target as GraphNode).x!)
        .attr("y2", (d) => (d.target as GraphNode).y!);

      node.attr("transform", (d) => `translate(${d.x!}, ${d.y!})`);
    });

    applyScaling(currentTransformRef.current.k, nodeScale, semanticZoom);

    return () => {
      simulation.stop();
    };
  }, [nodes, links, applyScaling, nodeScale, semanticZoom, repulsion, focusMode, focusSubsetIds, selectedTagIds]);

  // Effect 2: Update Highlighting / Selection / Opacity smoothly in-place WITHOUT restarting simulation
  useEffect(() => {
    if (!svgRef.current) return;
    const svg = d3.select(svgRef.current);

    const hasFocus = focusTagIds.size > 0;

    // Update Node Groups Opacity & Halos
    svg.selectAll<SVGGElement, GraphNode>(".graph-node-group")
      .each(function (d) {
        const isSelected = selectedTagIds.has(d.id);
        const isFocused = focusTagIds.has(d.id);
        const isConnected = connectedNeighborIds.has(d.id);

        const group = d3.select(this);

        // Opacity — only dim when NOT in focus mode (in focus mode the graph is already subset)
        let targetOpacity = 1.0;
        if (hasFocus && !focusMode && !isFocused && !isConnected) {
          targetOpacity = 0.12;
        }
        group.transition().duration(120).style("opacity", targetOpacity);

        // Selected Halo
        group.select(".graph-node-halo-selected")
          .style("display", isSelected ? "block" : "none");

        // Connected Halo
        group.select(".graph-node-halo-connected")
          .style("display", isConnected && !isSelected ? "block" : "none");

        // Label highlight
        group.select(".graph-node-label")
          .attr("font-weight", isSelected || isConnected ? "700" : "500")
          .attr("fill", isSelected ? "#3b82f6" : isConnected ? "#f59e0b" : "currentColor");

        // Circle stroke highlight
        group.select(".graph-node-circle")
          .attr("stroke", isSelected ? "#1d4ed8" : isConnected ? "#f59e0b" : d.color_accent);

        if (isFocused || isConnected) {
          group.raise();
        }
      });

    // Update Links Highlight & Opacity
    svg.selectAll<SVGLineElement, GraphLink>(".graph-link")
      .each(function (d) {
        const srcId = getLinkId(d.source);
        const tgtId = getLinkId(d.target);
        const isHighlighted =
          hasFocus &&
          ((focusTagIds.has(srcId) && (connectedNeighborIds.has(tgtId) || focusTagIds.has(tgtId))) ||
           (focusTagIds.has(tgtId) && (connectedNeighborIds.has(srcId) || focusTagIds.has(srcId))));

        const defaultOpacity = d.isParentChild ? 0.25 : 0.06 + d.normalizedStrength * 0.35;
        d3.select(this)
          .transition()
          .duration(120)
          .attr("stroke", isHighlighted ? "#3b82f6" : "currentColor")
          .attr("stroke-opacity", hasFocus && !focusMode
            ? (isHighlighted ? 0.85 : 0.03)
            : defaultOpacity);
      });
  }, [focusTagIds, connectedNeighborIds, selectedTagIds, focusMode]);

  // Effect 3: React to Node Scale and Semantic Zoom changes in-place
  useEffect(() => {
    applyScaling(currentTransformRef.current.k, nodeScale, semanticZoom);
  }, [nodeScale, semanticZoom, applyScaling]);

  // Effect 4: React to Repulsion changes dynamically in force simulation
  useEffect(() => {
    if (simulationRef.current) {
      simulationRef.current.force("charge", d3.forceManyBody().strength(-repulsion));
      simulationRef.current.alpha(0.2).restart();
    }
  }, [repulsion]);

  const handleZoomIn = () => {
    if (!svgRef.current || !zoomBehaviorRef.current) return;
    d3.select(svgRef.current).transition().duration(250).call(zoomBehaviorRef.current.scaleBy, 1.35);
  };

  const handleZoomOut = () => {
    if (!svgRef.current || !zoomBehaviorRef.current) return;
    d3.select(svgRef.current).transition().duration(250).call(zoomBehaviorRef.current.scaleBy, 0.75);
  };

  const handleFitToScreen = () => {
    if (!svgRef.current || !zoomBehaviorRef.current || !containerRef.current) return;
    const width = containerRef.current.clientWidth || 600;
    const height = containerRef.current.clientHeight || 500;
    const nodeCount = nodes.length;
    const fitScale = nodeCount < 30 ? 0.9 : nodeCount < 80 ? 0.65 : 0.5;
    const fitTransform = d3.zoomIdentity
      .translate(width * (1 - fitScale) / 2, height * (1 - fitScale) / 2)
      .scale(fitScale);
    d3.select(svgRef.current).transition().duration(350).call(zoomBehaviorRef.current.transform, fitTransform);
  };

  const handleReheatPhysics = () => {
    if (simulationRef.current) {
      simulationRef.current.alpha(0.3).restart();
    }
  };

  const canFocus = selectedTagIds.size > 0;

  if (tags.length === 0) {
    return (
      <div className="tag-explorer-empty">
        <p className="text-sm text-slate-500 dark:text-slate-400">No tags match the current filter.</p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="tag-graph-container" role="region" aria-label="Tag Relationship Graph">
      <div className="tag-graph-controls">
        {/* Settings Toggle */}
        <button
          type="button"
          className={`tag-graph-btn tag-graph-settings-btn ${settingsOpen ? "tag-graph-btn-active" : ""}`}
          onClick={() => setSettingsOpen((prev) => !prev)}
          title="Graph settings"
          aria-label="Toggle graph settings"
          aria-expanded={settingsOpen}
        >
          <Settings2 size={14} />
          {settingsOpen ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
        </button>

        {/* Focus Selection Button — only visible when tags are selected */}
        {canFocus && (
          <button
            type="button"
            className={`tag-graph-btn tag-graph-focus-btn ${focusMode ? "tag-graph-btn-active" : ""}`}
            onClick={() => setFocusMode((prev) => !prev)}
            title={focusMode ? "Show full graph" : "Focus on selected tags and their neighbors"}
            aria-label={focusMode ? "Show full graph" : "Focus on selection"}
          >
            <Focus size={14} />
          </button>
        )}

        {/* Zoom & Reset Controls — always visible */}
        <div className="tag-graph-btn-group">
          <button
            type="button"
            className="tag-graph-btn"
            onClick={handleZoomIn}
            title="Zoom in"
            aria-label="Zoom in"
          >
            <Plus size={14} />
          </button>
          <button
            type="button"
            className="tag-graph-btn"
            onClick={handleZoomOut}
            title="Zoom out"
            aria-label="Zoom out"
          >
            <Minus size={14} />
          </button>
          <button
            type="button"
            className="tag-graph-btn"
            onClick={handleFitToScreen}
            title="Fit to screen"
            aria-label="Fit to screen"
          >
            <Maximize2 size={13} />
          </button>
          <button
            type="button"
            className="tag-graph-btn"
            onClick={handleReheatPhysics}
            title="Re-settle graph layout"
            aria-label="Re-settle graph layout"
          >
            <RotateCcw size={13} />
          </button>
        </div>
      </div>

      {/* Collapsible Settings Panel */}
      {settingsOpen && (
        <div className="tag-graph-settings-panel">
          {/* Min Links Slider */}
          <div className="tag-graph-setting-row">
            <Sliders size={13} className="text-slate-400 shrink-0" />
            <label className="text-xs text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
              Min links: {minSharedCount}
              <input
                type="range"
                min="1"
                max="15"
                step="1"
                value={minSharedCount}
                onChange={(e) => setMinSharedCount(parseInt(e.target.value, 10))}
                className="tag-graph-slider"
                title="Filter minimum co-occurrence threshold"
              />
            </label>
          </div>

          {/* Node Size Slider — range 25% to 400% */}
          <div className="tag-graph-setting-row">
            <CircleDot size={13} className="text-slate-400 shrink-0" />
            <label className="text-xs text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
              Node size: {Math.round(nodeScale * 100)}%
              <input
                type="range"
                min="0.25"
                max="4.0"
                step="0.25"
                value={nodeScale}
                onChange={(e) => setNodeScale(parseFloat(e.target.value))}
                className="tag-graph-slider"
                title="Independent node size adjustment"
              />
            </label>
          </div>

          {/* Repulsion Force Slider */}
          <div className="tag-graph-setting-row">
            <Sparkles size={13} className="text-slate-400 shrink-0" />
            <label className="text-xs text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
              Repulsion: {repulsion}
              <input
                type="range"
                min="50"
                max="1000"
                step="25"
                value={repulsion}
                onChange={(e) => setRepulsion(parseInt(e.target.value, 10))}
                className="tag-graph-slider"
                title="Adjust node repulsion distance"
              />
            </label>
          </div>

          {/* Semantic Zoom Toggle */}
          <div className="tag-graph-setting-row">
            <button
              type="button"
              className={`tag-graph-setting-toggle ${semanticZoom ? "active" : ""}`}
              onClick={() => setSemanticZoom((prev) => !prev)}
              title={semanticZoom ? "Fixed Size: Nodes maintain fixed screen size" : "Scale Zoom: Nodes scale with zoom level"}
            >
              <span className="tag-graph-setting-toggle-indicator" />
              <span className="text-xs">{semanticZoom ? "Fixed size" : "Scale zoom"}</span>
            </button>
          </div>

          {/* Hide System Tags Toggle */}
          <div className="tag-graph-setting-row">
            <button
              type="button"
              className={`tag-graph-setting-toggle ${hideSystemTags ? "active" : ""}`}
              onClick={() => setHideSystemTags((prev) => !prev)}
              title={hideSystemTags ? "System tags hidden — click to show" : "System tags visible — click to hide"}
            >
              {hideSystemTags ? <EyeOff size={12} className="text-slate-400" /> : <Eye size={12} className="text-slate-400" />}
              <span className="text-xs">{hideSystemTags ? "System tags hidden" : "System tags shown"}</span>
            </button>
          </div>
        </div>
      )}

      {/* Focus mode indicator */}
      {focusMode && selectedTagIds.size > 0 && (
        <div className="tag-graph-focus-indicator">
          <Focus size={12} />
          <span className="text-xs">
            Focused: {renderedTags.length} tags
          </span>
          <button
            type="button"
            className="tag-graph-focus-exit"
            onClick={() => setFocusMode(false)}
            title="Exit focus mode"
          >
            ×
          </button>
        </div>
      )}

      <svg ref={svgRef} className="tag-graph-svg" />
    </div>
  );
}
