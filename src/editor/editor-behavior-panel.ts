/** Edits typed behavior graph nodes and reports structural graph facts before compiler validation. */

import type { EditorCommandStack } from "./editor-command-stack";
import type { EditorSelection, EditorState, JsonObject, JsonValue } from "./editor-state";
import type { EditorViewport } from "./editor-viewport";

/** Narrows canonical JSON before behavior graph structure is inspected. */
function isObject(value: JsonValue | undefined): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Supports both direct graph definitions and definitions wrapped in a graph property. */
function graphObject(root: JsonObject): JsonObject {
  return isObject(root.graph) ? root.graph : root;
}

/** Appends a uniquely identified, fully configured idle action accepted by the behavior runtime. */
function addNode(root: JsonObject): JsonObject {
  const copy = structuredClone(root);
  const graph = graphObject(copy);
  const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
  const identifiers = new Set(nodes.filter(isObject).map((node) => node.id).filter((id): id is string => (
    typeof id === "string"
  )));
  let index = nodes.length + 1;
  while (identifiers.has(`node-${index}`)) index += 1;
  const identifier = `node-${index}`;
  graph.nodes = [...nodes, { id: identifier, type: "action", action: "idle" }];
  if (typeof graph.rootNodeId !== "string") graph.rootNodeId = identifier;
  const rootNode = graph.nodes.find((node) => isObject(node) && node.id === graph.rootNodeId);
  if (isObject(rootNode) && Array.isArray(rootNode.children)) rootNode.children.push(identifier);
  return copy;
}

export class EditorBehaviorPanel {
  /** Reports graph structure and provides command-backed creation for a valid typed node. */
  render(
    container: HTMLElement,
    selection: EditorSelection,
    value: JsonValue,
    commands: EditorCommandStack,
    viewport: EditorViewport,
    state: EditorState,
  ): boolean {
    if (selection.kind !== "behavior" || !isObject(value)) return false;
    const graph = graphObject(value);
    const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
    const transitions = Array.isArray(graph.transitions) ? graph.transitions : [];
    const card = document.createElement("section");
    card.className = "context-card";
    const title = document.createElement("h3");
    title.textContent = "How this creature thinks";
    const summary = document.createElement("p");
    summary.textContent = `${nodes.length} logic blocks · ${transitions.length} links`;
    const nodeList = document.createElement("div");
    nodeList.className = "behavior-block-list";
    nodes.filter(isObject).forEach((node) => {
      const block = document.createElement("div");
      const type = typeof node.type === "string" ? node.type : "unknown";
      block.className = `behavior-block behavior-block-${type}`;
      const name = document.createElement("strong");
      name.textContent = typeof node.id === "string" ? node.id.replaceAll("-", " ") : "Logic block";
      const description = document.createElement("span");
      const operation = typeof node.action === "string"
        ? node.action
        : typeof node.condition === "string"
          ? node.condition
          : type;
      description.textContent = operation.replaceAll("_", " ");
      block.append(name, description);
      nodeList.append(block);
    });
    const actions = document.createElement("div");
    actions.className = "context-actions";
    const add = document.createElement("button");
    add.type = "button";
    add.textContent = "Add do-nothing step";
    add.title = "Append a uniquely identified idle action and connect it to a compatible root node.";
    add.addEventListener("click", () => {
      commands.execute(selection.file, selection.pointer, addNode(value), "Add behavior node");
    });
    actions.append(add);
    card.append(title, summary, nodeList, actions);
    container.append(card, this.createRuntimeInspector(value, viewport, state));
    return true;
  }

  /** Creates a live production graph test using the first entity definition that references this behavior. */
  private createRuntimeInspector(value: JsonObject, viewport: EditorViewport, state: EditorState): HTMLElement {
    const card = document.createElement("section");
    card.className = "context-card";
    const heading = document.createElement("h3");
    heading.textContent = "Try this behavior";
    const graphId = typeof value.id === "string" ? value.id : "";
    const definitions = state.fileEntries().flatMap(([, root]) => {
      if (!isObject(root) || !Array.isArray(root.entities)) return [];
      return root.entities.filter(isObject);
    });
    const definition = definitions.find((entry) => entry.behaviorGraphId === graphId);
    const actions = document.createElement("div");
    actions.className = "context-actions";
    const start = document.createElement("button");
    const output = document.createElement("pre");
    output.className = "entity-blackboard";
    start.type = "button";
    const displayName = definition === undefined || typeof definition.displayName !== "string"
      ? "linked entity"
      : definition.displayName;
    start.textContent = definition === undefined ? "Connect a creature first" : `Start ${displayName}`;
    start.title = definition === undefined
      ? "This behavior cannot run until an entity references its graph ID."
      : `Start an isolated production scene using ${displayName}.`;
    start.disabled = definition === undefined;
    start.addEventListener("click", () => {
      if (definition === undefined) return;
      try {
        viewport.startEntityTest();
        if (typeof definition.id === "string") viewport.spawnTestEntity(definition.id);
      } catch (error: unknown) {
        output.textContent = error instanceof Error ? error.message : "Behavior test could not start.";
      }
    });
    const engage = document.createElement("button");
    engage.type = "button";
    engage.textContent = "Bring player close";
    engage.title = "Place the test player near the actor to exercise perception, targeting, and combat nodes.";
    engage.addEventListener("click", () => {
      const target = viewport.entityDebugSnapshots()[0];
      if (target !== undefined) viewport.engageTestEntity(target.id);
    });
    actions.append(start, engage);
    card.append(heading, actions, output);
    this.refreshRuntimeOutput(output, viewport);
    return card;
  }

  /** Polls detached production blackboards while the selected behavior panel remains mounted. */
  private refreshRuntimeOutput(output: HTMLElement, viewport: EditorViewport): void {
    let lastUpdate = 0;
    const update = (time: number): void => {
      if (!output.isConnected) return;
      if (time - lastUpdate >= 200) {
        output.textContent = JSON.stringify(viewport.entityDebugSnapshots(), null, 2);
        lastUpdate = time;
      }
      requestAnimationFrame(update);
    };
    requestAnimationFrame(update);
  }
}
