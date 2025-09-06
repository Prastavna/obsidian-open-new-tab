import { Plugin, Notice } from 'obsidian';
import { OpenInNewTabSettings, DEFAULT_SETTINGS } from './types';
import { OpenInNewTabSettingTab } from './settings';
import { FileUtils } from './utils';
import { OverrideManager } from './overrides';

export default class OpenInNewTabPlugin extends Plugin {
    settings: OpenInNewTabSettings;
    private fileUtils: FileUtils;
    private overrideManager: OverrideManager;

    async onload() {
        console.log('Loading Open in New Tab plugin');

        await this.loadSettings();

        // Initialize utilities and managers
        this.fileUtils = new FileUtils(this.app, this.settings);
        this.overrideManager = new OverrideManager(this.app, this, this.settings, this.fileUtils);

        // Add settings tab
        this.addSettingTab(new OpenInNewTabSettingTab(this.app, this));

        // Override various opening methods
        this.overrideManager.overrideOpenLinkText();
        this.overrideManager.overrideFileOpening();
        this.overrideManager.overrideFileExplorer();
        this.overrideManager.overrideSearchPane();
        this.overrideManager.overrideQuickSwitcher();

        // Add commands
        this.addCommands();
    }

    onunload() {
        console.log('Unloading Open in New Tab plugin');
        this.overrideManager.restoreOriginalMethods();
        this.overrideManager.cleanup();
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
        // Update settings in utilities and managers
        this.fileUtils.updateSettings(this.settings);
        this.overrideManager.updateSettings(this.settings);
    }

    private addCommands() {
        this.addCommand({
            id: 'open-graph-view-new-tab',
            name: 'Open Graph View in New Tab',
            callback: () => {
                const leaf = this.app.workspace.getLeaf('tab');
                leaf.setViewState({ type: 'graph' });
                if (this.settings.showNotifications) {
                    new Notice('Graph view opened in new tab');
                }
            }
        });
    }
}
