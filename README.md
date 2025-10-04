# Sandbox Note for Obsidian

A simple, temporary spot for your quick thoughts.

This plugin provides a special "Sandbox Note," a scratchpad for temporary notes that are **not** saved as regular files in your vault. It's designed to give you a clean space for messy ideas without creating clutter.

![Demo Image](assets/demo.png)

## How It Works

This plugin offers a flexible temporary note-taking experience:

*   **Ephemeral by Default**: Each new sandbox note you open is a fresh, empty scratchpad. Its content persists across Obsidian restarts but is separate from other sandbox notes.
*   **Synced Tabs (Optional)**: If you open the same sandbox note in multiple tabs (e.g., using "Open in new tab"), the content will be synchronized across all of them.
*   **Automatic Saving**: Note contents are automatically saved to the plugin's local database (IndexedDB). This helps prevent losing your thoughts when you close Obsidian.
*   **No Files Created**: Write freely without creating new `.md` files in your vault, keeping your file explorer clean.
*   **Familiar Editor**: Works just like Obsidian's own markdown editor, supporting markdown, links, and commands.

## How to Use

*   Click the ribbon icon (package icon) to open a new **Sandbox Note**.
*   Or, use the Command Palette (`Ctrl/Cmd+P`) and search for "Open new hot sandbox note."
*   You can convert your Sandbox Note to a standard file with a command or by enabling `Ctrl+S` (or `Cmd+S`) in the settings.

---

## ⚠️ A Note on Compatibility

To achieve its functionality, this plugin relies on some of Obsidian's internal, undocumented APIs. Please keep the following in mind:

*   **Obsidian Updates May Cause Issues**: Future updates to Obsidian could change these internal APIs, which might cause this plugin to stop working as expected. We will do our best to keep it updated, but cannot guarantee it will always be compatible.
*   **Use at Your Own Risk**: We encourage you to understand how the plugin works. It's best suited for temporary or non-critical notes.

---

## Installation

1.  Open Obsidian's **Settings**.
2.  Go to **Community plugins** and turn off **Restricted mode**.
3.  Click **Browse** to find community plugins.
4.  Search for "**Sandbox Note**".
5.  Click **Install**, then **Enable**.

## Acknowledgements

The idea for this plugin was partly inspired by the [obsidian-lineage](https://github.com/ycnmhd/obsidian-lineage) plugin by ycnmhd.
