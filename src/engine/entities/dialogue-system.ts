/**
 * Manages one validated NPC conversation and exposes immutable presentation state to the HUD.
 * Dialogue choices only follow authored node IDs and cannot execute commands or arbitrary script text.
 */

import type { DialogueDefinition } from "./entity-model";

/** ActiveDialogue is the complete UI-facing conversation snapshot. */
export interface ActiveDialogue {
  readonly entityId: string;
  readonly definitionId: string;
  readonly nodeId: string;
  readonly text: string;
  readonly choices: readonly string[];
}

/** DialogueSystem validates transitions against indexed authored definitions. */
export class DialogueSystem {
  private readonly definitions: ReadonlyMap<string, DialogueDefinition>;
  private active: ActiveDialogue | null = null;

  public constructor(definitions: readonly DialogueDefinition[]) {
    this.definitions = new Map(definitions.map((definition) => [definition.id, definition]));
  }

  /** Starts one NPC conversation at its declared start node. */
  public begin(entityId: string, definitionId: string): ActiveDialogue | null {
    const definition = this.definitions.get(definitionId);
    if (definition === undefined) {
      return null;
    }
    return this.activateNode(entityId, definition, definition.startNodeId);
  }

  /** Selects one visible choice and follows its validated destination or closes a terminal node. */
  public choose(index: number): ActiveDialogue | null {
    if (this.active === null || !Number.isInteger(index)) {
      return this.active;
    }
    const definition = this.definitions.get(this.active.definitionId);
    const node = definition?.nodes.find((candidate) => candidate.id === this.active?.nodeId);
    const choice = node?.choices[index];
    if (definition === undefined || choice === undefined || choice.nextNodeId === undefined) {
      this.active = null;
      return null;
    }
    return this.activateNode(this.active.entityId, definition, choice.nextNodeId);
  }

  /** Returns the current immutable dialogue snapshot for HUD rendering. */
  public getActive(): ActiveDialogue | null {
    return this.active;
  }

  /** Closes any conversation when distance, combat, or player input invalidates it. */
  public close(): void {
    this.active = null;
  }

  /** Resolves one node and creates its presentation snapshot. */
  private activateNode(
    entityId: string,
    definition: DialogueDefinition,
    nodeId: string,
  ): ActiveDialogue | null {
    const node = definition.nodes.find((candidate) => candidate.id === nodeId);
    if (node === undefined) {
      this.active = null;
      return null;
    }
    this.active = {
      entityId,
      definitionId: definition.id,
      nodeId: node.id,
      text: node.text,
      choices: node.choices.map((choice) => choice.text),
    };
    return this.active;
  }
}
