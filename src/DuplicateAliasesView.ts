import { ItemView, WorkspaceLeaf } from "obsidian"
import { DuplicateAliasesViewIdentifier, DuplicateAliasesViewName, DuplicateAliasesViewIcon } from "./const"
import { init_duplicate_aliases_view } from "./funcs"
import type AliasManagementPlugin from "./main"

export class DuplicateAliasesView extends ItemView {
  private plugin: AliasManagementPlugin

  constructor(leaf: WorkspaceLeaf, plugin: AliasManagementPlugin) {
    super(leaf)
    this.plugin = plugin
  }

  getViewType() { return DuplicateAliasesViewIdentifier; }

  getDisplayText() { return DuplicateAliasesViewName; }

  public getIcon(): string { return DuplicateAliasesViewIcon; }

  async onOpen() {
    const container = this.containerEl.children[1]
    container.empty()
    const view = container.createEl('div', { cls: DuplicateAliasesViewIdentifier })

    view.createEl('div', {cls: 'header'})
    const body = view.createEl('div', {cls: 'body'})

    init_duplicate_aliases_view(this.plugin, body)
  }

  async onClose() {
    const container = this.containerEl.children[1]
    container.empty()
  }
}