import { App, PluginSettingTab, Setting } from "obsidian"
import AliasManagementPlugin from "./main"
import { PluginIdentifier, ListAliasesViewIdentifier, DuplicateAliasesViewIdentifier } from "./const"
import { init_list_aliases_view, init_duplicate_aliases_view, parse_regex_lines_sed, find_duplicate_aliases_view, sort_duplicate_aliases_view, split_csv_string, parse_regex_lines_simple_flags } from "./funcs"

export interface SettingsTypes {
  add_filename_to_aliases: boolean
  add_filename_as_alphabetical_sorted_words: boolean
  add_aliases_as_alphabetical_sorted_words: boolean
  case_insensitive: boolean
  ignore_folders_csv: string
  replace_regex_str: string
  exclude_physical_aliases_regex_str: string
  sort_desc: boolean
  open_links_vertically_splitted: boolean
}

export const DefaultSettings: SettingsTypes = {
  add_filename_to_aliases: true,
  add_filename_as_alphabetical_sorted_words: true,
  add_aliases_as_alphabetical_sorted_words: true,
  case_insensitive: true,
  ignore_folders_csv: 'assets, images',
  replace_regex_str: `s/[^\\w\\s]|_/ /g
s/ //g`,
  exclude_physical_aliases_regex_str: `^readme$/i
^general$/i`,
  sort_desc: true,
  open_links_vertically_splitted: true
}

export class SettingsTab extends PluginSettingTab {
  plugin: AliasManagementPlugin

  constructor(app: App, plugin: AliasManagementPlugin) {
    super(app, plugin)
    this.plugin = plugin
  }

  display(): void {
    const { containerEl } = this

    containerEl.empty()

    let view = containerEl.createEl('div', { cls: `${PluginIdentifier}_settings` })

    new Setting(view)
      .setName('Add filenames to aliases')
      .setDesc('Toggle to include filenames as aliases.')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.add_filename_to_aliases)
        .onChange(async (value) => {
          this.plugin.settings.add_filename_to_aliases = value
          await this.plugin.saveSettings()
          this.reload()
        }))

    new Setting(view)
      .setName('Sort multi-word filenames alphabetically')
      .setDesc("Arrange filenames with multiple words alphabetically. For example, `to go` becomes `go to`.")
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.add_filename_as_alphabetical_sorted_words)
        .onChange(async (value) => {
          this.plugin.settings.add_filename_as_alphabetical_sorted_words = value
          await this.plugin.saveSettings()
          this.reload()
        }))

    new Setting(view)
      .setName('Sort multi-word aliases alphabetically')
      .setDesc('Arrange aliases with multiple words alphabetically.')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.add_aliases_as_alphabetical_sorted_words)
        .onChange(async (value) => {
          this.plugin.settings.add_aliases_as_alphabetical_sorted_words = value
          await this.plugin.saveSettings()
          this.reload()
        }))

    new Setting(view)
      .setName('Ignore capitalization')
      .setDesc("Toggle to disregard capitalization differences in aliases and filenames. For example, `NOTE` is treated as `note`.")
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.case_insensitive)
        .onChange(async (value) => {
          this.plugin.settings.case_insensitive = value
          await this.plugin.saveSettings()
          this.reload()
        }))

    new Setting(view)
      .setName('Exclude files')
      .setDesc('Exclude files located within specified folder paths. Paths should be comma-separated and relative to the root.')
      .addText(text => text
        .setValue(this.plugin.settings.ignore_folders_csv)
        .onChange(async (value) => {
          this.plugin.settings.ignore_folders_csv = value
          await this.plugin.saveSettings()
          this.plugin.ignore_folders = split_csv_string(this.plugin.settings.ignore_folders_csv)
          this.reload()
        }))

    new Setting(view)
      .setName('Replace aliases')
      .setDesc('Define regular expressions to replace specific patterns within aliases. For instance, special characters can be replaced with spaces.')
      .addTextArea(text => text
        .setValue(this.plugin.settings.replace_regex_str)
        .onChange(async (value) => {
          this.plugin.settings.replace_regex_str = value
          await this.plugin.saveSettings()
          this.plugin.replace_regex = parse_regex_lines_sed(value)
          this.reload()
        }))

    new Setting(view)
      .setName('Exclude aliases')
      .setDesc('Define regular expressions to exclude specific aliases. This can be useful for filtering out common or irrelevant aliases.')
      .addTextArea(text => text
        .setValue(this.plugin.settings.exclude_physical_aliases_regex_str)
        .onChange(async (value) => {
          this.plugin.settings.exclude_physical_aliases_regex_str = value
          await this.plugin.saveSettings()
          this.plugin.exclude_physical_aliases_regex = parse_regex_lines_simple_flags(value)
          this.reload()
        }))

    new Setting(view)
      .setName('Descending order')
      .setDesc('Sort the lists of duplicate aliases in descending order based on the number of occurrences.')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.sort_desc)
        .onChange(async (value) => {
          this.plugin.settings.sort_desc = value
          await this.plugin.saveSettings()

          if (this.plugin.app.workspace.getLeavesOfType(DuplicateAliasesViewIdentifier).length === 1) {
            const view = find_duplicate_aliases_view()
            if(!view) {
              return
            }
            sort_duplicate_aliases_view(this.plugin, view)
          }
        }))

    new Setting(view)
      .setName('Open notes side by side')
      .setDesc('Enable to open notes side by side, facilitating easier comparison between files.')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.open_links_vertically_splitted)
        .onChange(async (value) => {
          this.plugin.settings.open_links_vertically_splitted = value
          await this.plugin.saveSettings()
        }))
  }

  reload(): void {
    this.plugin.physical_alias_to_generated_aliases = new Map()

    if (this.plugin.app.workspace.getLeavesOfType(ListAliasesViewIdentifier).length === 1) {
      init_list_aliases_view(this.plugin)
    }

    if (this.plugin.app.workspace.getLeavesOfType(DuplicateAliasesViewIdentifier).length === 1) {
      init_duplicate_aliases_view(this.plugin)
    }
  }
}
