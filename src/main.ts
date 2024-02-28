import { Plugin, TFile, CachedMetadata, WorkspaceLeaf } from "obsidian"
import { SettingsTypes, DefaultSettings, SettingsTab } from "./settings"
import { active_leaf_changed, file_changed, file_renamed, file_deleted, parse_regex_lines_sed, split_csv_string, parse_regex_lines_simple_flags } from "./funcs"

// ListAliasesView
import { ListAliasesView } from "./ListAliasesView"
import { ListAliasesViewName, ListAliasesViewIdentifier, ListAliasesViewIcon, ListAliasesViewCommandDesc } from "./const"

// DuplicateAliasesView
import { DuplicateAliasesView } from "./DuplicateAliasesView"
import { DuplicateAliasesViewName, DuplicateAliasesViewIdentifier, DuplicateAliasesViewIcon, DuplicateAliasesViewCommandDesc } from "./const"

export default class AliasManagementPlugin extends Plugin {
  settings: SettingsTypes = DefaultSettings

  fpath_to_physical_aliases = new Map<string, string[]>();
  physical_alias_to_generated_aliases = new Map<string, Set<string>>();
  generated_alias_to_fpaths= new Map<string, Array<[string, string, string]>>();

  // If there are aliases to be excluded matching filenames: keep mapping for correct color representation
  fpath_filename_ignored = new Set<string>();

  replace_regex: [RegExp, string][]
  ignore_folders: string[]
  exclude_physical_aliases_regex: RegExp[]

  async onload() {
    await this.loadSettings()

    //
    //
    // ListAliasesView
    //
    //
    this.registerView(
      ListAliasesViewIdentifier,
      (leaf) => new ListAliasesView(leaf, this)
    )
    this.addRibbonIcon(ListAliasesViewIcon, ListAliasesViewName, async () => {
      this.activateListAliasesView()
    })
    this.addCommand({
      id: `${ListAliasesViewIdentifier}_open-view`,
      name: ListAliasesViewCommandDesc,
      callback: () => {
        this.activateListAliasesView()
      }
    })

    //
    //
    // DuplicateAliasesView
    //
    //
    this.registerView(
      DuplicateAliasesViewIdentifier,
      (leaf) => new DuplicateAliasesView(leaf, this)
    )
    this.addRibbonIcon(DuplicateAliasesViewIcon, DuplicateAliasesViewName, async () => {
      this.activateDuplicateAliasesView()
    })
    this.addCommand({
      id: `${DuplicateAliasesViewIdentifier}_open-view`,
      name: DuplicateAliasesViewCommandDesc,
      callback: () => {
        this.activateDuplicateAliasesView()
      }
    })

    this.addSettingTab(new SettingsTab(this.app, this))

    this.registerEvent(this.app.vault.on('rename', this.onRename, this))
    this.registerEvent(this.app.metadataCache.on('changed', this.onChanged, this))
    this.registerEvent(this.app.metadataCache.on('deleted', this.onDeleted, this))
    this.registerEvent(this.app.workspace.on('active-leaf-change', this.onActiveLeafChange, this))
  }

  async loadSettings() {
    this.settings = Object.assign({}, DefaultSettings, await this.loadData())
    this.replace_regex = parse_regex_lines_sed(this.settings.replace_regex_str)
    this.ignore_folders = split_csv_string(this.settings.ignore_folders_csv)
    this.exclude_physical_aliases_regex = parse_regex_lines_simple_flags(this.settings.exclude_physical_aliases_regex_str)
  }

  public async activateListAliasesView() {
    let leaves = this.app.workspace.getLeavesOfType(ListAliasesViewIdentifier)
    if (leaves.length === 0) {
      await this.app.workspace.getRightLeaf(false).setViewState({
        type: ListAliasesViewIdentifier,
        active: true,
      })
    }
    leaves = this.app.workspace.getLeavesOfType(ListAliasesViewIdentifier)
    this.app.workspace.revealLeaf(leaves[0])
  }

  public async activateDuplicateAliasesView() {
    let leaves = this.app.workspace.getLeavesOfType(DuplicateAliasesViewIdentifier)
    if (leaves.length === 0) {
      await this.app.workspace.getRightLeaf(false).setViewState({
        type: DuplicateAliasesViewIdentifier,
        active: true,
      })
    }
    leaves = this.app.workspace.getLeavesOfType(DuplicateAliasesViewIdentifier)
    this.app.workspace.revealLeaf(leaves[0])

  }

  async onActiveLeafChange(leaf: WorkspaceLeaf) {
    active_leaf_changed(this, leaf)
  }

  async onRename(file_new: TFile, fpath_old: string) {
    file_renamed(this, file_new, fpath_old)
  }

  async onChanged(file: TFile, md_content: string, cache: CachedMetadata) {
    file_changed(this, file, md_content, cache)
  }

  async onDeleted(file: TFile, prevCache: CachedMetadata | null) {
    file_deleted(this, file, prevCache)
  }

  onunload() {

  }

  async saveSettings() {
    await this.saveData(this.settings)
  }
}