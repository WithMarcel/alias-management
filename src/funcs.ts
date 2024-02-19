import { TFile, WorkspaceLeaf, MarkdownView, EditorPosition, CachedMetadata } from "obsidian";
import { PluginIdentifier, ListAliasesViewIdentifier, DuplicateAliasesViewIdentifier } from "./const"

function find_list_aliases_view(): HTMLDivElement | null {
  return document.querySelector(`.${ListAliasesViewIdentifier}`) as HTMLDivElement | null
}

export function find_duplicate_aliases_view(): HTMLDivElement | null {
  return document.querySelector(`.${DuplicateAliasesViewIdentifier} .body`) as HTMLDivElement | null
}

function get_physical_aliases_from_fpath(fpath: string, do_not_store?: boolean, fpath_old?: string): string[] {
  const plugin = this.app.plugins.plugins[PluginIdentifier]

  let cached_metadata = this.app.metadataCache.getCache(fpath)
  if(!cached_metadata && fpath_old){
    cached_metadata = this.app.metadataCache.getCache(fpath_old)
  }
  if(!cached_metadata) {
    return []
  }

  let physical_aliases: string[] = []

  // Unify alias(es) as Obsidian has either "aliases" or "alias" in frontmatter
  if(!cached_metadata.frontmatter){
    // Add empty aliases array as file does not have a frontmatter
    cached_metadata['frontmatter'] = { 'aliases': physical_aliases}
  } else if(cached_metadata.frontmatter?.aliases) {
    physical_aliases = cached_metadata.frontmatter.aliases
  } else if(cached_metadata.frontmatter?.alias) {
    const alias = cached_metadata.frontmatter.alias
    if(typeof alias === 'string') {
      const aliases_splitted = alias.split(',')
      physical_aliases = aliases_splitted
    } else {
      physical_aliases.push(alias)
    }
    delete cached_metadata.frontmatter['alias']
  }

  // Clean physical aliases
  physical_aliases = physical_aliases
      .filter((entry: string | number | null | undefined) => {
          if (typeof entry === 'string') {
              return entry.trim() !== ''; // Remove empty strings
          } else if (typeof entry === 'number') {
              return true; // Keep numbers
          }
          return false; // Remove null and undefined entries
      })
      .map((entry: string | number) => {
          if (typeof entry === 'string') {
              return entry.trim(); // Trim each string entry
          } else {
              return entry.toString(); // Convert numbers to string
          }
      });

  // Assign unified and cleaned physical aliases to frontmatter
  if(cached_metadata.frontmatter){
    cached_metadata.frontmatter['aliases'] = [...physical_aliases]
  }

  // Add the filename to aliases if the setting is enabled
  if(plugin.settings.add_filename_to_aliases) {
    let file = this.app.vault.getAbstractFileByPath(fpath)
    if (!(file instanceof TFile)) {
      file = this.app.vault.getAbstractFileByPath(fpath_old)
    }
    if(file instanceof TFile) {
      physical_aliases.unshift(file.basename)
    }
  }

  if(plugin.exclude_physical_aliases_regex.length > 0) {
    physical_aliases = physical_aliases.filter((physical_alias: any, index: number) => {
      const is_excluded = plugin.exclude_physical_aliases_regex.some((regex_pattern: RegExp) => regex_pattern.test(physical_alias));
      if(is_excluded && plugin.settings.add_filename_to_aliases && index === 0) {
        plugin.fpath_filename_ignored.add(fpath);
      }
      // Return true for items that should be kept
      return !is_excluded;
    });

    if(fpath_old){
      plugin.fpath_filename_ignored.delete(fpath_old)
    }
  }

  // Store the aliases in the plugin's map
  if(do_not_store !== true){
    plugin.fpath_to_physical_aliases.set(fpath, physical_aliases)
  }

  return physical_aliases
}

function generate_aliases(physical_alias: string, add_to_dupes?: boolean, fpath?: string, type?: string): Set<string> {
  const plugin = this.app.plugins.plugins[PluginIdentifier]

  // Retrieve generated aliases from map/cache
  let generated_aliases = plugin.physical_alias_to_generated_aliases.get(physical_alias)

  // Generate aliases for physical alias
  if(!generated_aliases) {
    const physical_alias_preprocessed: string = plugin.settings.case_insensitive ? physical_alias.toLowerCase() : physical_alias;

    generated_aliases = new Set([physical_alias_preprocessed])

    // Sort individual words
    const sort_fname = plugin.settings.add_filename_as_alphabetical_sorted_words && type === 'fname';
    const sort_alias = plugin.settings.add_aliases_as_alphabetical_sorted_words && type === 'alias';
    if(sort_fname || sort_alias) {
        generated_aliases.add(sort_words_in_string(physical_alias_preprocessed));
    }

    // Apply regex
    if(plugin.replace_regex) {
      for (const [regex, replacement] of plugin.replace_regex) {
        for (let generated_alias of generated_aliases) {
          generated_alias = generated_alias.replace(regex, replacement)
          if(!generated_alias) {
            continue
          }
          generated_aliases.add(generated_alias)
        }
      }
      if(sort_fname || sort_alias) {
        for (let generated_alias of generated_aliases) {
          generated_aliases.add(sort_words_in_string(generated_alias));
        }
      }
    }
  }

  // Cache generated_aliases mapped to physical_alias
  plugin.physical_alias_to_generated_aliases.set(physical_alias, generated_aliases)

  // Add generated aliases to duplicates
  if(add_to_dupes && fpath && physical_alias && type) {
    add_generated_aliases_with_fpath_to_dupes(generated_aliases, fpath, physical_alias, type)
  }

  return generated_aliases
}

export function init_list_aliases_view(fpath_in?: string, fpath_new?: string) {
  const view = find_list_aliases_view()
  if(!view) {
    return
  }

  // Clear the list aliases view
  empty_list_aliases_view()

  // Initialize fpath with the provided value or the active file's path
  let fpath: string = fpath_new || fpath_in || this.app.workspace.getActiveFile()?.path
  if(!fpath) {
    return
  }

  const plugin = this.app.plugins.plugins[PluginIdentifier]

  // Empty mapping fpath_filename_ignored in case list aliases view is the only view open
  if(!find_duplicate_aliases_view()){
    plugin.fpath_filename_ignored.clear()
  }

  if(plugin.ignore_folders && plugin.ignore_folders.some((skip_folder: string) => fpath.startsWith(`${skip_folder}/`))) {
    return
  }

  // Get physical aliases from the provided fpath
  const do_not_store = true
  let physical_aliases: string[]

  if(fpath_in && fpath_new){
    physical_aliases = get_physical_aliases_from_fpath(fpath_new, do_not_store, fpath_in)
  } else {
    physical_aliases = get_physical_aliases_from_fpath(fpath, do_not_store)
  }

  if(physical_aliases.length === 0) {
    return
  }

  // Create a div element for the aliases
  const div: HTMLElement = view.createEl('div', { cls: JSON.stringify({ 'fpath': fpath }) })

  // Map to track occurrences of physical aliases
  const occurrences: Map<string, number> = new Map()

  const add_to_dupes = false

  // Iterate through physical aliases
  for (let i = 0; i < physical_aliases.length; i++) {
    const physical_alias = physical_aliases[i]

    let type: string = ''
    if(i === 0 && plugin.settings.add_filename_to_aliases){
      if(fpath_new && !plugin.fpath_filename_ignored.has(fpath_new)){
        type = 'fname'
      } else if(fpath && !plugin.fpath_filename_ignored.has(fpath)){
        type = 'fname'
      }
    }

    if(!type){
      type = 'alias'
    }

    // Create details element
    const details = div.createEl('details', { cls: type })
    details.setAttribute('open', '')

    // Create summary element with link
    const summary = details.createEl('summary')
    const link_title: string = type === 'fname' ? 'from filename' : 'from alias';
    const link = summary.createEl('a', { href: fpath, text: physical_alias, title: `${physical_alias} (${link_title})` })

    // Add click event listener based on type
    if(type === 'fname') {
      link.addEventListener('click', () => open_file(fpath));
    } else {
      let occurrence: number = occurrences.get(physical_alias) || 0
      occurrences.set(physical_alias, ++occurrence)

      link.addEventListener('click', () => select_physical_alias_in_file(fpath, physical_alias, occurrence));
    }

    // Generate and display aliases
    const generated_aliases = generate_aliases(physical_alias, add_to_dupes, fpath, type)
    const ul: HTMLElement = details.createEl('ul')
    for (const generated_alias of generated_aliases) {
      let li = createEl('li', { text: generated_alias })
      ul.appendChild(li)
    }
  }
}

function empty_list_aliases_view(fpath?: string) {
  const view = find_list_aliases_view()
  if(!view) {
    return
  }

  // Nothing to empty
  if(fpath && !aliases_listed_for_fpath(fpath)) {
    return
  }

  // Clear the content of ListAliasesView
  view.empty()
}

export function init_duplicate_aliases_view(view?: HTMLDivElement | null): void {
  if(!view) {
    view = find_duplicate_aliases_view()
    if(!view) {
      return
    }
  }

  view.empty()

  const plugin = this.app.plugins.plugins[PluginIdentifier]

  // Reinitialize plugin properties
  plugin.generated_alias_to_fpaths = new Map<string, Array<[string, string]>>();

  const add_to_dupes = true

  const cached_files = this.app.metadataCache.getCachedFiles()
  for (let i = 0; i < cached_files.length; i++) {
    const fpath = cached_files[i]

    // Check if file should be skipped
    if(plugin.ignore_folders && plugin.ignore_folders.some((skip_folder: string) => fpath.startsWith(`${skip_folder}/`))) {
      continue
    }
    const physical_aliases: string[] = get_physical_aliases_from_fpath(fpath)
    add_physical_aliases(physical_aliases, fpath, add_to_dupes, view)
  }
  sort_duplicate_aliases_view(view)
}

function add_generated_alias_with_fpath_to_dupes(generated_alias: string, fpath: string, physical_alias: string, type: string) {
  const plugin = this.app.plugins.plugins[PluginIdentifier]

  if(!plugin.generated_alias_to_fpaths.has(generated_alias)) {
    plugin.generated_alias_to_fpaths.set(generated_alias, new Array())
  }

  plugin.generated_alias_to_fpaths.get(generated_alias)!.push([fpath, physical_alias, type])
}

function add_generated_aliases_with_fpath_to_dupes(generated_aliases: Set<string>, fpath: string, physical_alias: string, type: string) {
  for (const generated_alias of generated_aliases) {
    add_generated_alias_with_fpath_to_dupes(generated_alias, fpath, physical_alias, type)
  }
}

export function active_leaf_changed(leaf: WorkspaceLeaf) {
  const list_aliases_view = this.app.workspace.getLeavesOfType(ListAliasesViewIdentifier)
  if(list_aliases_view.length === 1) {
    let active_file = this.app.workspace.getActiveFile()

    // If no active file, clear the list aliases view
    if(!active_file) {
      empty_list_aliases_view()
      return
    }

    // If aliases are already listed for the active file, return
    if(aliases_listed_for_fpath(active_file.path)) {
      return
    }

    // Initialize the list aliases view for the active file
    init_list_aliases_view(active_file.path)
  }
}

export function file_changed(file: TFile, md_content: string, cache: CachedMetadata) {
  const fpath = file.path
  file_changed_duplicate_aliases(fpath)
  file_changed_list_aliases(fpath)
}

function file_changed_list_aliases(fpath: string) {
  const leaves = this.app.workspace.getLeavesOfType(ListAliasesViewIdentifier)
  if(leaves.length === 1 && aliases_listed_for_fpath(fpath)) {
    init_list_aliases_view(fpath)
  }
}

function file_changed_duplicate_aliases(fpath: string) {
  const leaves = this.app.workspace.getLeavesOfType(DuplicateAliasesViewIdentifier)
  if(leaves.length !== 1) {
    return
  }

  const view = find_duplicate_aliases_view()
  if(!view) {
    return
  }

  const plugin = this.app.plugins.plugins[PluginIdentifier]

  let physical_aliases_old = plugin.fpath_to_physical_aliases.get(fpath)

  const file_moved_outside_obsidian = physical_aliases_old === undefined
  if(file_moved_outside_obsidian){
    physical_aliases_old = []
  }

  const physical_aliases_new = get_physical_aliases_from_fpath(fpath)

  const aliases = compare_lists(physical_aliases_old, physical_aliases_new)

  // Nothing changed
  if(aliases.removed.length === 0 && aliases.added.length === 0) {
    return
  }

  if(aliases.removed.length > 0) {
    const type = 'alias'
    remove_physical_aliases(aliases.removed, fpath, view, type)
  }

  if(aliases.added.length > 0) {
    const add_to_dupes = true

    if(!file_moved_outside_obsidian){
      const type = aliases.added.length === 1 && physical_aliases_old.length === 0 && !plugin.fpath_filename_ignored.has(fpath) ? 'fname' : 'alias';
      add_physical_aliases(aliases.added, fpath, add_to_dupes, view, type)
    } else {
      add_physical_aliases(aliases.added, fpath, add_to_dupes, view)
    }
  }
  sort_duplicate_aliases_view(view)

  plugin.fpath_to_physical_aliases.set(fpath, physical_aliases_new)
}

export function file_renamed(file_new: TFile, fpath_old: string) {
  file_renamed_duplicate_aliases(file_new, fpath_old)
  file_renamed_list_aliases(file_new.path, fpath_old)
}

function file_renamed_list_aliases(fpath_new: string, fpath_old: string) {
  const leaves = this.app.workspace.getLeavesOfType(ListAliasesViewIdentifier)
  if(leaves.length === 1 && (aliases_listed_for_fpath(fpath_old) || (fpath_new && aliases_listed_for_fpath(fpath_new)) || no_aliases_listed())) {
    init_list_aliases_view(fpath_old, fpath_new)
  }
}

function file_renamed_duplicate_aliases(file_new: TFile, fpath_old: string) {
  const leaves = this.app.workspace.getLeavesOfType(DuplicateAliasesViewIdentifier)
  if(leaves.length !== 1) {
    return
  }

  const view = find_duplicate_aliases_view()
  if(!view){
    return
  }

  const plugin = this.app.plugins.plugins[PluginIdentifier]

  const add_to_dupes = true

  // New file, add to internal structures
  if(!plugin.fpath_to_physical_aliases.has(fpath_old)) {
    const do_not_store = false
    const physical_aliases: string[] = get_physical_aliases_from_fpath(file_new.path, do_not_store, fpath_old)
    add_physical_aliases(physical_aliases, file_new.path, add_to_dupes, view)
    sort_duplicate_aliases_view(view)
    return
  }

  // Remove aliases of old file
  const physical_aliases = plugin.fpath_to_physical_aliases.get(fpath_old)
  remove_physical_aliases(physical_aliases, fpath_old, view)

  // File is now in a folder that should be skipped
  if(plugin.ignore_folders && plugin.ignore_folders.some((skip_folder: string) => file_new.path.startsWith(`${skip_folder}/`))) {
    sort_duplicate_aliases_view(view)
    plugin.fpath_to_physical_aliases.delete(fpath_old)
    plugin.fpath_filename_ignored.delete(fpath_old)
    return
  }

  // Check if fname should be excluded based on regex patterns (to refactor)
  if(plugin.settings.add_filename_to_aliases) {
    const physical_alias_fname_new = file_new.basename
    if(plugin.exclude_physical_aliases_regex.length > 0) {
      const should_exclude_filename = !plugin.exclude_physical_aliases_regex.every((regex_pattern: RegExp) => !regex_pattern.test(physical_alias_fname_new));
      if(should_exclude_filename) {
        if(!plugin.fpath_filename_ignored.has(fpath_old)){
          // Remove first alias (old fname)
          physical_aliases.shift()
        }
        plugin.fpath_filename_ignored.add(file_new.path)
      } else if(plugin.fpath_filename_ignored.has(fpath_old)) {
        // Add new fname to beginning if old fpath was excluded before renaming it
        physical_aliases.unshift(physical_alias_fname_new)
      } else {
        // Overwrite/set old fname entry (first list entry) to new fname
        physical_aliases[0] = physical_alias_fname_new
      }
    } else {
      // Overwrite/set old fname entry (first list entry) to new fname
      physical_aliases[0] = physical_alias_fname_new
    }
    plugin.fpath_filename_ignored.delete(fpath_old)
  }

  const fpath_new = file_new.path
  add_physical_aliases(physical_aliases, fpath_new, add_to_dupes, view)
  sort_duplicate_aliases_view(view)

  plugin.fpath_to_physical_aliases.set(file_new.path, physical_aliases)
  plugin.fpath_to_physical_aliases.delete(fpath_old)
}

export function file_deleted(file: TFile, prevCache: CachedMetadata | null) {
  file_deleted_duplicate_aliases(file)

  const plugin = this.app.plugins.plugins[PluginIdentifier]

  plugin.fpath_filename_ignored.delete(file.path)

  file_deleted_list_aliases(file.path)
}

function file_deleted_list_aliases(fpath: string, fpath_new?: string) {
  const leaves = this.app.workspace.getLeavesOfType(ListAliasesViewIdentifier)
  if(leaves.length === 1 && aliases_listed_for_fpath(fpath)) {
    empty_list_aliases_view()
  }
}

function file_deleted_duplicate_aliases(file: TFile) {
  const leaves = this.app.workspace.getLeavesOfType(DuplicateAliasesViewIdentifier)
  if(leaves.length !== 1) {
    return
  }

  const view = find_duplicate_aliases_view()
  if(!view){
    return
  }

  const plugin = this.app.plugins.plugins[PluginIdentifier]

  const fpath = file.path
  if(!plugin.fpath_to_physical_aliases.has(fpath)) {
    return
  }

  const physical_aliases = plugin.fpath_to_physical_aliases.get(fpath)
  remove_physical_aliases(physical_aliases, fpath, view)
  sort_duplicate_aliases_view(view)

  plugin.fpath_to_physical_aliases.delete(fpath)
}

export function sort_duplicate_aliases_view(view: HTMLDivElement): void {
  if(!view || !view.parentElement) {
    return
  }

  // Remove empty ul elements and ul elements with only have one li element
  let selector = `details:has(> ul:empty), details:has(ul > li:first-child:last-child)`
  let details_elements_to_remove = view.querySelectorAll(selector)
  for (let i = 0; i < details_elements_to_remove.length; i++) {
    details_elements_to_remove[i].remove()
  }

  // Get details elements from the container
  const details_elements = view.querySelectorAll('details')

  // Update counter values
  const header = view.parentElement.querySelector('.header')

  // Check if details elements exist
  if((!details_elements || details_elements.length === 0) && header) {
    header.empty()
    return
  }

  // Convert NodeList to Array for better manipulation
  const details_arr = Array.from(details_elements)

  // Access the plugin settings
  const settings = this.app.plugins.plugins[PluginIdentifier].settings

  // Sort details elements by the number of li elements and then by summary text

  details_arr.sort((a, b) => {
    const li_a_list = a.querySelectorAll('li')
    const li_b_list = b.querySelectorAll('li')

    // Determine sorting order based on the number of li elements
    const order_list = settings.sort_desc ? li_a_list.length - li_b_list.length : li_b_list.length - li_a_list.length;
    const summary_a = a.querySelector('summary')
    const summary_b = b.querySelector('summary')

    // If the number of li elements is the same, compare by the text in the summary element
    if(order_list === 0 && summary_a?.textContent && summary_b?.textContent) {
      const summary_a_text = summary_a.textContent.trim()
      const summary_b_text = summary_b.textContent.trim()

      // Use localeCompare for string comparison to handle special characters and case sensitivity
      return settings.sort_desc ? summary_b_text.localeCompare(summary_a_text) : summary_a_text.localeCompare(summary_b_text);
    }

    return order_list
  }).forEach(details => view.insertBefore(details, view.firstChild))

  // Sort each details ul entry to prioritize li elements with classname 'fname'
  details_arr.forEach(details => {
    const li_arr = Array.from(details.querySelectorAll('li'))
    const ul = details.querySelector('ul') as HTMLElement

    // Sort by classname 'fname' and maintain the order of other li entries
    li_arr.sort((a, b) => (a.classList[0] === 'fname' && !(b.classList[0] === 'fname')) ? 1 : (!(a.classList[0] === 'fname') && b.classList[0] === 'fname') ? -1 : 0)
      .forEach(li => ul.insertBefore(li, ul.firstChild));

    // Move li elements with classname 'fname' to the top
    li_arr.sort((a, b) => (a.classList[0] === 'fname') ? 0 : -1)
      .forEach(li => ul.insertBefore(li, ul.firstChild));
  });

  const li_elements = view.querySelectorAll('li')
  const ul_elements = view.querySelectorAll('ul')
  const ul_elements_unique = new Map<string, HTMLUListElement>()

  // Iterate over each ul element
  ul_elements.forEach(ul => {
    // Get all li elements within the current ul
    const li_elements = ul.querySelectorAll('li')
    // Create an array to store class names of li elements
    const classnames_array: string[] = []
    // Iterate over each li element
    li_elements.forEach(li => {
      // Get the class attribute value and add it to classnames_array
      classnames_array.push(li.className)
    });
    // Sort the classnames_array to ensure consistent comparison
    classnames_array.sort()
    // Convert classnames_array into a string to create a unique identifier
    const class_str = classnames_array.join(' ')
    // Add the ul element to ul_elements_unique Map using the class_str as key
    ul_elements_unique.set(class_str, ul)
  });

  if(header){
    header.empty()
    const header_text = `${li_elements.length} links in ${ul_elements.length} list${ul_elements.length !== 1 ? 's' : ''}`
    const header_main = header.createEl('div', { text: header_text, title: `${header_text}${ul_elements.length > 1 ? ` (${ul_elements_unique.size} unique list${ul_elements_unique.size > 1 ? 's' : ''})` : ''}` });
  }

}

function remove_physical_alias(physical_alias: string, fpath: string, view: HTMLDivElement, type: string) {
  const plugin = this.app.plugins.plugins[PluginIdentifier]

  const generated_aliases = plugin.physical_alias_to_generated_aliases.get(physical_alias)
  for (const generated_alias of generated_aliases) {
    // Construct a CSS selector for the ul element holding alias entries
    const selector_details = CSS.escape(JSON.stringify({ 'generated_alias': generated_alias }))
    const ul_element = view.querySelector(`details[class="${selector_details}"] ul`) as HTMLDetailsElement | null

    if(ul_element) {
      // Construct a CSS selector for the li elements to be removed
      const selector_li = type + ' ' + CSS.escape(JSON.stringify({ 'physical_alias': physical_alias, 'href': fpath }))
      const li_elements = ul_element.querySelectorAll(`li[class="${selector_li}"]`)

      // Update li elements
      if(li_elements.length > 0) {
        // Remove the first li element (only first as this function is called for every physical alias removed)
        li_elements[0].remove()

        // Update remaining li elements (especially the click event)
        for (let i = 1; i < li_elements.length; i++) {
          li_elements[i].remove()
          add_li_to_ul(ul_element, physical_alias, fpath, type, i)
        }
      }
    }

    if(!plugin.generated_alias_to_fpaths.has(generated_alias)) {
      continue
    }

    const arr = plugin.generated_alias_to_fpaths.get(generated_alias)

    // Find the index of the entry to be removed within the array
    let index_to_remove = arr.findIndex((sub_array: string[]) => sub_array[0] === fpath && sub_array[1] === physical_alias && sub_array[2] === type)
    if(index_to_remove === -1) {
      return
    }

    // Remove the entry from the array
    arr.splice(index_to_remove, 1)

    // Delete the whole entry from the map if the array is empty
    if(arr.length === 0) {
      plugin.generated_alias_to_fpaths.delete(generated_alias)
    }
  }
}

function remove_physical_aliases(physical_aliases: string[], fpath: string, view: HTMLDivElement, type?: string) {
  const plugin = this.app.plugins.plugins[PluginIdentifier]

  for (let i = 0; i < physical_aliases.length; i++) {
    const physical_alias = physical_aliases[i]

    // Determine the final type for removal based on the provided type or settings
    const type_final: string = type ? type : (plugin.settings.add_filename_to_aliases && i === 0 && !plugin.fpath_filename_ignored.has(fpath) ? 'fname' : 'alias');

    remove_physical_alias(physical_alias, fpath, view, type_final)
  }
}

function add_physical_alias(physical_alias: string, fpath: string, add_to_dupes: boolean, view: HTMLDivElement, type: string): void {
  const plugin = this.app.plugins.plugins[PluginIdentifier]

  const generated_aliases = generate_aliases(
    physical_alias,
    add_to_dupes,
    fpath,
    type
  )

  for (const generated_alias of generated_aliases) {
    const selector = CSS.escape(JSON.stringify({ 'generated_alias': generated_alias }))
    const ul_elements = view.querySelectorAll(`details[class="${selector}"] ul`)

    // If UL elements are found, extend them with LI elements
    if(ul_elements.length > 0) {
      for (let j = 0; j < ul_elements.length; j++) {
        const ul = ul_elements[j]
        add_li_to_ul(ul, physical_alias, fpath, type)
      }
      // Continue to the next generated alias as LI elements were created
      continue
    }

    // Check if a summary with UL and LI elements needs to be added
    if(!plugin.generated_alias_to_fpaths.has(generated_alias)) {
      continue
    }

    const generated_alias_in_fpaths = plugin.generated_alias_to_fpaths.get(generated_alias)

    // If the generated alias appears in less than 2 files, skip
    if(generated_alias_in_fpaths.length < 2) {
      continue
    }

    // Create details, summary, and UL elements
    const details = view.createEl('details', { cls: JSON.stringify({ 'generated_alias': generated_alias }) })
    details.setAttribute('open', '')
    details.createEl('summary', { text: generated_alias, title: generated_alias })
    const ul: HTMLElement = details.createEl('ul')

    // Iterate through generated alias entries and add LI elements to the UL
    for (let j = 0; j < generated_alias_in_fpaths.length; j++) {
      const fpath = generated_alias_in_fpaths[j][0]
      const physical_alias = generated_alias_in_fpaths[j][1]
      const type = generated_alias_in_fpaths[j][2]
      add_li_to_ul(ul, physical_alias, fpath, type)
    }
  }
}

function add_physical_aliases(physical_aliases: string[], fpath: string, add_to_dupes: boolean, view: HTMLDivElement, type?: string) {
  const plugin = this.app.plugins.plugins[PluginIdentifier]

  for (let i = 0; i < physical_aliases.length; i++) {
    const physical_alias = physical_aliases[i]

    // Determine the final type for removal based on the provided type or settings
    const type_final: string = type ? type : (plugin.settings.add_filename_to_aliases && i === 0 && !plugin.fpath_filename_ignored.has(fpath) ? 'fname' : 'alias');

    add_physical_alias(physical_alias, fpath, add_to_dupes, view, type_final)
  }
}

function add_li_to_ul(ul: Element, physical_alias: string, fpath: string, type: string, occurrence?: number) {
  // Create a unique selector based on physical alias and file path
  const selector = JSON.stringify({ 'physical_alias': physical_alias, 'href': fpath })

  // Create a list item element with the specified class
  const li = createEl('li', { cls: `${type} ${selector}` })

  // Create a link element within the list item
  const link_title: string = type === 'fname' ? 'from filename' : 'from alias';
  const link = li.createEl('a', { text: physical_alias, href: fpath, title: `${fpath} (${link_title})` })

  // Create click events to open file
  if(type === 'fname') {
    link.addEventListener('click', (event: MouseEvent) => { open_file(fpath) })
  } else {
    let occurrence_final: number

    if(occurrence) {
      occurrence_final = occurrence
    } else {
      // Calculate the occurrence based on existing list items with the same type and selector
      const li_elements_already_added = ul.querySelectorAll(`li[class="${type} ${CSS.escape(selector)}"`)
      occurrence_final = li_elements_already_added.length + 1
    }

    link.addEventListener('click', (event: MouseEvent) => {
      select_physical_alias_in_file(fpath, physical_alias, occurrence_final)
    });
  }

  ul.appendChild(li)
}

async function select_physical_alias_in_file(fpath: string, physical_alias: string, occurrence: number): Promise<void> {
  const file_opened = await open_file(fpath)
  if(!file_opened) {
    return
  }

  // Highlight alias in reading mode
  const selector = `div.metadata-property[data-property-key="aliases"] div.multi-select-pill-content`
  const aliases_in_reading_view = document.querySelectorAll(selector)

  for (let i = 0; i < aliases_in_reading_view.length; i++) {
    if(aliases_in_reading_view[i].textContent !== physical_alias) {
      continue
    }
    aliases_in_reading_view[i].classList.add('alias-management_highlight');

    setTimeout(() => {
      aliases_in_reading_view[i].classList.remove('alias-management_highlight');
    }, 2000);
  }

  // Retrieve frontmatter information
  const cached_file = this.app.metadataCache.getCache(fpath)
  if(!cached_file || !cached_file.frontmatterPosition || !cached_file.frontmatterPosition['start']) {
    return
  }

  const fm_start_offset = cached_file.frontmatterPosition['start']['offset']
  const fm_end_offset = cached_file.frontmatterPosition['end']['offset']

  // Get frontmatter content as string
  const file = this.app.vault.getAbstractFileByPath(fpath)
  const file_content = await get_file_content(file)
  const frontmatter = file_content.slice(fm_start_offset, fm_end_offset)

  // Escape physical alias for regex search
  let physical_alias_escaped_regex = escape_regex(physical_alias)

  // Search aliases with quotes
  let re_pattern = `" *${physical_alias_escaped_regex} *"`
  let re = new RegExp(re_pattern)
  let alias_index_start = regex_index_of(frontmatter, re, occurrence)

  // If quoted alias not found, try searching without quotes using word boundary
  if(alias_index_start === -1) {
    re_pattern = `\\b${physical_alias_escaped_regex}\\b`
    re = new RegExp(re_pattern)
    alias_index_start = regex_index_of(frontmatter, re, occurrence)
  }

  let selection_len = physical_alias.length

  // If alias contains escape char or a double quote, we need to escape it and add the number of expand the selection by the number of occurrences
  const must_be_escaped = physical_alias.indexOf('"') !== -1 || physical_alias.indexOf('\\') !== -1
  if(alias_index_start === -1 && must_be_escaped) {
    let occurrences_escape_char = 0
    let physical_alias_escaped = physical_alias

    if(physical_alias.indexOf('\\') !== -1){
      physical_alias_escaped = physical_alias_escaped.replace(/\\/g, '\\\\')
      occurrences_escape_char += physical_alias.split('\\').length - 1;
    }

    if(physical_alias.indexOf('"') !== -1){
      physical_alias_escaped = physical_alias_escaped.replace(/"/g, '\\"')
      occurrences_escape_char += physical_alias.split('"').length - 1;
    }

    re_pattern = `" *${escape_regex(physical_alias_escaped)} *"`
    re = new RegExp(re_pattern)
    alias_index_start = regex_index_of(frontmatter, re, occurrence)

    if(alias_index_start !== -1){
      selection_len += occurrences_escape_char
    }
  }

  if(alias_index_start === -1) {
    re_pattern = `${physical_alias_escaped_regex}`
    re = new RegExp(re_pattern)
    alias_index_start = regex_index_of(frontmatter, re, occurrence)
  }

  let line_no = frontmatter.slice(0, alias_index_start).split(/\r\n|\r|\n/).length - 1

  // Get number of characters before the line
  let chars_before_line = 0
  let chars_per_linebreak = frontmatter.includes('\r\n') ? 2 : 1;

  for (const i of Array(line_no).keys()) {
    chars_before_line += frontmatter.split(/\r\n|\r|\n/)[i].length + chars_per_linebreak
  }

  const line = frontmatter.split(/\r\n|\r|\n/)[line_no]
  let column_from = alias_index_start - chars_before_line

  const leaf = this.app.workspace.getLeaf()

  // Adjust selection based on specific conditions
  adjust_selection(line, line_no, column_from, selection_len, chars_per_linebreak, fm_start_offset, leaf)
}

function adjust_selection(line: string, line_no: number, column_from: number, selection_len: number, chars_per_linebreak: number, fm_start_offset: number, leaf: any) {
  if(column_from > 0) {
    if(is_simple_markdown_list_entry(line)) {
      const from: EditorPosition = { line: line_no, ch: 0 }
      const to: EditorPosition = { line: line_no, ch: line.length + chars_per_linebreak }
      leaf.view.editor.setSelection(from, to)
      return
    }

    if(line.charAt(column_from) == '"') {
      selection_len += 1
    }

    if(line.charAt(column_from + selection_len) == '"') {
      selection_len += 1
    }

    // Check if it is an unquoted comma-separated list match at the end of a list
    if(line.slice(column_from - 2, column_from) === ', ') {
      column_from -= 2
      selection_len += 2
      let column_to = fm_start_offset + column_from + selection_len

      const from: EditorPosition = { line: line_no, ch: column_from }
      const to: EditorPosition = { line: line_no, ch: column_to }
      leaf.view.editor.setSelection(from, to)
      return
    }

    if(line.charAt(column_from + selection_len) == ',') {
      selection_len += 1
    }
    if(line.charAt(column_from + selection_len) == ' ') {
      selection_len += 1
    }

    if(line.charAt(column_from + selection_len) == ']') {
      if(line.charAt(column_from - 1) == ' ' || line.charAt(column_from - 1) == ',') {
        column_from -= 1
        selection_len += 1
      }
    }
  }

  let column_to = fm_start_offset + column_from + selection_len

  const from: EditorPosition = { line: line_no, ch: column_from }
  const to: EditorPosition = { line: line_no, ch: column_to }
  leaf.view.editor.setSelection(from, to)
}

function is_simple_markdown_list_entry(line: string): boolean {
  const regular_expression = /^ +- /
  return regular_expression.test(line)
}

function sort_words_in_string(input: string): string {
  // Try to split the input string into an array of words
  const words_array: string[] = input.split(' ')

  // Return input word if it cannot be sorted
  if(words_array.length === 1){
    return input
  }

  // Sort the array in alphabetical order
  const sorted_words_array: string[] = words_array.sort()

  // Join the sorted array back into a string with space as delimiter
  const sorted_string: string = sorted_words_array.join(' ')

  return sorted_string
}

export function parse_regex_lines_sed(regex_input: string): [RegExp, string][] {
  try {
    return regex_input
      .trim()
      .split('\n')
      .map((line) => {
        const [, regex_str, replacement, flags] = line.trim().match(/^s\/(.*?)\/(.*?)\/([gimy]*)$/) || []
        if(regex_str && replacement !== undefined) {
          const regex = new RegExp(regex_str, flags)
          return [regex, replacement]
        } else {
          throw new Error(`Invalid regex syntax: ${line}`)
        }
      });
  } catch (error) {
    console.error(`Error parsing regex: ${error.message}`)
    return []
  }
}

export function parse_regex_lines_simple_flags(regex_input: string): RegExp[] {
  try {
    return regex_input
      .trim()
      .split('\n')
      .map((line) => {
        const [, regex_str, flags] = line.trim().match(/^(.*?)\/([gimy]*)$/) || []
        if(regex_str) {
          const regex = new RegExp(regex_str, flags)
          return regex
        } else {
          throw new Error(`Invalid regex syntax: ${line}`)
        }
      });
  } catch (error) {
    console.error(`Error parsing regex: ${error.message}`)
    return []
  }
}

function escape_regex(txt: string): string {
  return txt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

async function open_file(fpath: string): Promise<WorkspaceLeaf | boolean> {
  let target_leaf: WorkspaceLeaf | undefined = undefined

  let num_leaves: number = 0

  // Check if the file is already open in any leaf
  this.app.workspace.iterateAllLeaves((leaf: WorkspaceLeaf) => {
    if(leaf.view instanceof MarkdownView) {
      num_leaves += 1
      if(leaf.view?.file?.path === fpath) {
        target_leaf = leaf
      }
    }
  })

  if(target_leaf) {
    // If the file is already open, bring the leaf to the front
    this.app.workspace.setActiveLeaf(target_leaf, true, true)
    return target_leaf
  }

  const settings = this.app.plugins.plugins[PluginIdentifier].settings
  if(num_leaves === 0) {
    // If no leaves are open, open the file in the main pane
    target_leaf = this.app.workspace.getUnpinnedLeaf()
  } else if(settings.open_links_vertically_splitted) {
    // If configured to open links in a vertically split pane, do so
    target_leaf = this.app.workspace.splitActiveLeaf('vertical')
  } else {
    // Otherwise, open the file in a new tab
    target_leaf = this.app.workspace.getLeaf('tab')
  }

  if(!target_leaf) {
    return false
  }

  let file_opened = false
  let file = this.app.vault.getAbstractFileByPath(fpath)

  await target_leaf.openFile(file).then(() => {
    if(target_leaf && target_leaf.view instanceof MarkdownView) {
      // Set the active leaf to the one where the file was opened
      this.app.workspace.setActiveLeaf(target_leaf, true, true)
      file_opened = true
    }
  });

  if(!file_opened) {
    return false
  }

  return target_leaf
}

async function get_file_content(file: TFile): Promise<string> {
  return await this.app.vault.cachedRead(file)
}

function regex_index_of(txt: string, regex: RegExp, occurrence: number): number {
  let match_index = txt.search(regex)

  // If the occurrence is less than or equal to 1, return the initial match index
  if(occurrence <= 1) {
    return match_index
  }

  let char_counter = match_index
  let remaining_text = txt.substring(match_index + 1)
  let new_match_index
  for (let index of [...Array(occurrence - 1).keys()]) {
    new_match_index = remaining_text.search(regex) + 1

    char_counter += new_match_index
    remaining_text = remaining_text.substring(new_match_index)
  }

  return char_counter
}

function aliases_listed_for_fpath(fpath: string): boolean {
  let selector = CSS.escape(JSON.stringify({ 'fpath': fpath }))
  const div = document.querySelector(`.${ListAliasesViewIdentifier} div[class*="${selector}"]`) as HTMLDivElement
  return div ? true : false
}

function no_aliases_listed(): boolean {
  const div = document.querySelector(`.${ListAliasesViewIdentifier}:empty`) as HTMLDivElement
  return div ? true : false
}

function compare_lists(oldList: string[], newList: string[]): { removed: string[], added: string[] } {
  // Count the occurrences of each element in the old and new list
  const old_map = count_elements(oldList)
  const new_map = count_elements(newList)

  // Initialize arrays to store removed and added items
  const removed: string[] = []
  const added: string[] = []

  // Compare elements in the old list with the new list
  old_map.forEach((count, item) => {
    const new_count = new_map.get(item) || 0

    // If there are fewer occurrences in the new list, add the item to the removed array
    if(new_count < count) {
      for (let i = new_count; i < count; i++) {
        removed.push(item)
      }
    }
  });

  // Compare elements in the new list with the old list
  new_map.forEach((count, item) => {
    const old_count = old_map.get(item) || 0

    // If there are more occurrences in the new list, add the item to the added array
    if(old_count < count) {
      for (let i = old_count; i < count; i++) {
        added.push(item)
      }
    }
  });

  return { removed, added }
}

function count_elements(list: string[]): Map<string, number> {
  const element_count = new Map<string, number>()
  for (const item of list) {
    element_count.set(item, (element_count.get(item) || 0) + 1)
  }
  return element_count
}

export function split_csv_string(input: string): string[] {
  return input
    .split(',')
    .map((item) => item.trim().replace(/^\/|\/$/g, ''))
    .filter((item) => item !== '')
}
