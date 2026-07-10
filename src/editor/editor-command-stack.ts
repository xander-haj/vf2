/** Implements reversible content mutations without hiding changes inside UI controls. */

import type { EditorState, JsonValue } from "./editor-state";
import { resolvePointer } from "./editor-state";

interface EditorCommand {
  readonly label: string;
  readonly file: string;
  readonly pointer: string;
  readonly before: JsonValue;
  readonly after: JsonValue;
}

type HistoryListener = () => void;

/** Keeps a bounded command history and applies every mutation through EditorState. */
export class EditorCommandStack {
  private undoCommands: EditorCommand[] = [];
  private redoCommands: EditorCommand[] = [];
  private listeners = new Set<HistoryListener>();
  private readonly limit = 200;

  constructor(private readonly state: EditorState) {}

  /** Registers a history listener and returns a matching unsubscribe operation. */
  subscribe(listener: HistoryListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Captures and applies one JSON Pointer replacement as a reversible command. */
  execute(file: string, pointer: string, after: JsonValue, label: string): void {
    const root = this.state.fileEntries().find(([path]) => path === file)?.[1];
    const before = root === undefined ? undefined : resolvePointer(root, pointer);
    if (before === undefined) throw new Error(`Cannot edit missing content at ${file}${pointer}.`);
    if (JSON.stringify(before) === JSON.stringify(after)) return;
    const command: EditorCommand = {
      file,
      pointer,
      label,
      before: structuredClone(before),
      after: structuredClone(after),
    };
    this.state.replace(file, pointer, command.after);
    this.undoCommands.push(command);
    if (this.undoCommands.length > this.limit) this.undoCommands.shift();
    this.redoCommands = [];
    this.emit();
  }

  /** Restores the value before the newest command and makes that command redoable. */
  undo(): void {
    const command = this.undoCommands.pop();
    if (command === undefined) return;
    this.state.replace(command.file, command.pointer, command.before);
    this.redoCommands.push(command);
    this.emit();
  }

  /** Reapplies the newest reverted command without changing its original before value. */
  redo(): void {
    const command = this.redoCommands.pop();
    if (command === undefined) return;
    this.state.replace(command.file, command.pointer, command.after);
    this.undoCommands.push(command);
    this.emit();
  }

  /** Drops history after loading or saving establishes a new authoritative baseline. */
  clear(): void {
    this.undoCommands = [];
    this.redoCommands = [];
    this.emit();
  }

  get canUndo(): boolean { return this.undoCommands.length > 0; }
  get canRedo(): boolean { return this.redoCommands.length > 0; }
  get undoLabel(): string | undefined { return this.undoCommands.at(-1)?.label; }
  get redoLabel(): string | undefined { return this.redoCommands.at(-1)?.label; }

  /** Notifies toolbar subscribers after the two history stacks change. */
  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}
