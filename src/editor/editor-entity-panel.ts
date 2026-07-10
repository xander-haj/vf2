/** Adds complete component defaults to entity definitions through reversible commands. */

import type { EditorCommandStack } from "./editor-command-stack";
import type { EditorSelection, JsonObject, JsonValue } from "./editor-state";
import type { EditorViewport } from "./editor-viewport";

function isObject(value: JsonValue): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

const COMPONENT_DEFAULTS: Readonly<Record<string, JsonValue>> = {
  maxHealth: 20,
  speed: 1.8,
  perception: { range: 16, fieldOfViewDegrees: 120, memorySeconds: 5 },
  attack: { damage: 3, range: 1.8, cooldownSeconds: 1 },
};

const COMPONENT_HELP: Readonly<Record<string, string>> = {
  maxHealth: "How much damage it can take",
  speed: "How quickly it can move",
  perception: "How far and wide it can notice things",
  attack: "How it hurts a target and how often",
};

/** Adds one known entity contract field without inventing unvalidated component shapes. */
function addComponent(root: JsonObject, name: string): JsonObject {
  const copy = structuredClone(root);
  copy[name] = structuredClone(COMPONENT_DEFAULTS[name] ?? null);
  return copy;
}

export class EditorEntityPanel {
  /** Shows completeness of the initial simulation fields and offers valid defaults for missing fields. */
  render(
    container: HTMLElement,
    selection: EditorSelection,
    value: JsonValue,
    commands: EditorCommandStack,
    viewport: EditorViewport,
  ): boolean {
    if (selection.kind !== "entity" || !isObject(value)) return false;
    const card = document.createElement("section");
    card.className = "context-card";
    const title = document.createElement("h3");
    title.textContent = "Creature pieces";
    const actions = document.createElement("div");
    actions.className = "entity-component-grid";
    for (const name of Object.keys(COMPONENT_DEFAULTS)) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "entity-component-card";
      button.classList.toggle("complete", value[name] !== undefined);
      const label = document.createElement("strong");
      label.textContent = `${name.replaceAll(/([A-Z])/gu, " $1")} ${value[name] !== undefined ? "✓" : "+"}`;
      const help = document.createElement("span");
      help.textContent = COMPONENT_HELP[name] ?? "Creature setting";
      button.append(label, help);
      button.title = value[name] !== undefined
        ? `${name} is already present on this entity.`
        : `Add a complete validated ${name} component with safe initial values.`;
      button.disabled = value[name] !== undefined;
      button.addEventListener("click", () => {
        commands.execute(selection.file, selection.pointer, addComponent(value, name), `Add ${name} component`);
      });
      actions.append(button);
    }
    card.append(title, actions);
    container.append(card, this.createTestScene(value, viewport));
    return true;
  }

  /** Creates production spawn, combat, damage, and live blackboard controls for an isolated manager scene. */
  private createTestScene(value: JsonObject, viewport: EditorViewport): HTMLElement {
    const card = document.createElement("section");
    card.className = "context-card";
    const heading = document.createElement("h3");
    heading.textContent = "Try this creature";
    const actions = document.createElement("div");
    actions.className = "context-actions";
    const definitionId = typeof value.id === "string" ? value.id : "";
    const output = document.createElement("pre");
    output.className = "entity-blackboard";
    const start = document.createElement("button");
    start.type = "button";
    start.textContent = "Add one";
    start.title = "Start an isolated production scene and spawn one instance of this entity.";
    start.addEventListener("click", () => {
      try {
        viewport.startEntityTest();
        viewport.spawnTestEntity(definitionId);
      } catch (error: unknown) {
        output.textContent = error instanceof Error ? error.message : "Entity test could not start.";
      }
    });
    const rules = document.createElement("button");
    rules.type = "button";
    rules.textContent = "Fill the world";
    rules.title = "Start an isolated scene and evaluate authored deterministic spawn rules.";
    rules.addEventListener("click", () => {
      try { viewport.startEntityTest(); } catch (error: unknown) {
        output.textContent = error instanceof Error ? error.message : "Spawn test could not start.";
      }
    });
    const combat = document.createElement("button");
    combat.type = "button";
    combat.textContent = "Start a fight";
    combat.title = "Move the isolated player into range so normal perception and combat logic can run.";
    combat.addEventListener("click", () => {
      const target = viewport.entityDebugSnapshots().find((snapshot) => snapshot.definitionId === definitionId) ??
        viewport.entityDebugSnapshots()[0];
      if (target !== undefined) viewport.engageTestEntity(target.id);
    });
    const damage = document.createElement("button");
    damage.type = "button";
    damage.textContent = "Test 5 damage";
    damage.title = "Apply five points of normal entity damage to test hurt, death, persistence, and loot.";
    damage.addEventListener("click", () => {
      const target = viewport.entityDebugSnapshots().find((snapshot) => snapshot.definitionId === definitionId) ??
        viewport.entityDebugSnapshots()[0];
      if (target !== undefined) viewport.damageTestEntity(target.id, 5);
    });
    actions.append(start, rules, combat, damage);
    card.append(heading, actions, output);
    this.refreshBlackboard(output, viewport);
    return card;
  }

  /** Refreshes detached blackboard snapshots while this exact panel remains connected. */
  private refreshBlackboard(output: HTMLElement, viewport: EditorViewport): void {
    let lastUpdate = 0;
    const update = (time: number): void => {
      if (!output.isConnected) return;
      if (time - lastUpdate >= 200) {
        const status = viewport.entityTestStatus();
        output.textContent = status === null
          ? "Start a test to inspect live production blackboards."
          : JSON.stringify({
            playerHealth: status.playerHealth,
            messages: status.messages,
            entities: viewport.entityDebugSnapshots(),
          }, null, 2);
        lastUpdate = time;
      }
      requestAnimationFrame(update);
    };
    requestAnimationFrame(update);
  }
}
