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
        this.overrideManager.overrideSpecialViews();
        this.overrideManager.overrideFileExplorer();
        this.overrideManager.overrideSearchPane();

        // Add ribbon icon
        this.addRibbonIcon('external-link', 'Open in New Tab Settings', () => {
            // @ts-ignore
            this.app.setting.open();
            // @ts-ignore
            this.app.setting.openTabById(this.manifest.id);
        });

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
    }

    private addCommands() {
        this.addCommand({
            id: 'toggle-files-new-tab',
            name: 'Toggle: Open files in new tab',
            callback: () => {
                this.settings.openFilesInNewTab = !this.settings.openFilesInNewTab;
                this.saveSettings();
                new Notice(`Files in new tab: ${this.settings.openFilesInNewTab ? 'ON' : 'OFF'}`);
            }
        });

        this.addCommand({
            id: 'toggle-canvas-new-tab',
            name: 'Toggle: Open canvas in new tab',
            callback: () => {
                this.settings.openCanvasInNewTab = !this.settings.openCanvasInNewTab;
                this.saveSettings();
                new Notice(`Canvas in new tab: ${this.settings.openCanvasInNewTab ? 'ON' : 'OFF'}`);
            }
        });

        this.addCommand({
            id: 'toggle-graph-new-tab',
            name: 'Toggle: Open graph in new tab',
            callback: () => {
                this.settings.openGraphInNewTab = !this.settings.openGraphInNewTab;
                this.saveSettings();
                new Notice(`Graph in new tab: ${this.settings.openGraphInNewTab ? 'ON' : 'OFF'}`);
            }
        });

        this.addCommand({
            id: 'toggle-explorer-new-tab',
            name: 'Toggle: Open from explorer in new tab',
            callback: () => {
                this.settings.openFromExplorerInNewTab = !this.settings.openFromExplorerInNewTab;
                this.saveSettings();
                new Notice(`Explorer in new tab: ${this.settings.openFromExplorerInNewTab ? 'ON' : 'OFF'}`);
            }
        });

        this.addCommand({
            id: 'toggle-search-new-tab',
            name: 'Toggle: Open from search in new tab',
            callback: () => {
                this.settings.openFromSearchInNewTab = !this.settings.openFromSearchInNewTab;
                this.saveSettings();
                new Notice(`Search in new tab: ${this.settings.openFromSearchInNewTab ? 'ON' : 'OFF'}`);
            }
        });



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