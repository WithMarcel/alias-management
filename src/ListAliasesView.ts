import { ItemView, WorkspaceLeaf } from "obsidian"
import { ListAliasesViewIdentifier, ListAliasesViewName, ListAliasesViewIcon } from "./const"
import { init_list_aliases_view } from "./funcs"

export class ListAliasesView extends ItemView {
  constructor(leaf: WorkspaceLeaf) {
    super(leaf)
  }

  getViewType() { return ListAliasesViewIdentifier; }

  getDisplayText() { return ListAliasesViewName; }

  public getIcon(): string { return ListAliasesViewIcon; }

  async onOpen() {
    let container = this.containerEl.children[1]
    container.empty()
    container.createEl('div', { cls: ListAliasesViewIdentifier })

    init_list_aliases_view()
  }

  async onClose() {
    let container = this.containerEl.children[1]
    container.empty()
  }
}