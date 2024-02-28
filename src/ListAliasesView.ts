import { ItemView, WorkspaceLeaf } from "obsidian"
import { ListAliasesViewIdentifier, ListAliasesViewName, ListAliasesViewIcon } from "./const"
import { init_list_aliases_view } from "./funcs"
import type AliasManagementPlugin from "./main"

export class ListAliasesView extends ItemView {
  private plugin: AliasManagementPlugin

  constructor(leaf: WorkspaceLeaf, plugin: AliasManagementPlugin) {
    super(leaf)
    this.plugin = plugin
  }

  getViewType() { return ListAliasesViewIdentifier; }

  getDisplayText() { return ListAliasesViewName; }

  public getIcon(): string { return ListAliasesViewIcon; }

  async onOpen() {
    let container = this.containerEl.children[1]
    container.empty()
    container.createEl('div', { cls: ListAliasesViewIdentifier })

    init_list_aliases_view(this.plugin)
  }

  async onClose() {
    let container = this.containerEl.children[1]
    container.empty()
  }
}