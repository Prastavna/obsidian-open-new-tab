import { PluginSettingTab, Setting, App, Plugin } from 'obsidian';
import { OpenInNewTabSettings } from './types';

export class OpenInNewTabSettingTab extends PluginSettingTab {
    plugin: Plugin & { settings: OpenInNewTabSettings; saveSettings: () => Promise<void> };

    constructor(app: App, plugin: Plugin & { settings: OpenInNewTabSettings; saveSettings: () => Promise<void> }) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;

        containerEl.empty();

        containerEl.createEl('h2', { text: 'Open in New Tab Settings' });

        containerEl.createEl('p', {
            text: 'Configure which items should open in new tabs by default.'
        });

        new Setting(containerEl)
            .setName('Open ALL files in new tab')
            .setDesc('When enabled (default), ALL files open in new tabs. When disabled, only canvas, graph, search results, and tagged files open in new tabs based on their individual settings')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.openAllFilesInNewTab)
                .onChange(async (value: boolean) => {
                    this.plugin.settings.openAllFilesInNewTab = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Open canvas in new tab')
            .setDesc('Always open canvas files in a new tab')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.openCanvasInNewTab)
                .onChange(async (value: boolean) => {
                    this.plugin.settings.openCanvasInNewTab = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Open graph view in new tab')
            .setDesc('Always open the graph view in a new tab')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.openGraphInNewTab)
                .onChange(async (value: boolean) => {
                    this.plugin.settings.openGraphInNewTab = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Open from search pane in new tab')
            .setDesc('When clicking files in the search results pane, open them in new tabs')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.openFromSearchInNewTab)
                .onChange(async (value: boolean) => {
                    this.plugin.settings.openFromSearchInNewTab = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Tags for new tab')
            .setDesc('Comma-separated list of tags. Files with any of these tags will open in new tabs')
            .addText(text => text
                .setPlaceholder('tag1, tag2, tag3')
                .setValue(this.plugin.settings.tagsForNewTab)
                .onChange(async (value: string) => {
                    this.plugin.settings.tagsForNewTab = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('File extensions for new tab')
            .setDesc('Comma-separated list of file extensions. Files with these extensions will open in new tabs (e.g., png, pdf, jpg)')
            .addText(text => text
                .setPlaceholder('png, pdf, jpg, mp4')
                .setValue(this.plugin.settings.extensionsForNewTab)
                .onChange(async (value: string) => {
                    this.plugin.settings.extensionsForNewTab = value;
                    await this.plugin.saveSettings();
                }));



        // General section
        containerEl.createEl('h3', { text: 'General' });

        new Setting(containerEl)
            .setName('Show notifications')
            .setDesc('Show notifications when opening items in new tabs')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.showNotifications)
                .onChange(async (value: boolean) => {
                    this.plugin.settings.showNotifications = value;
                    await this.plugin.saveSettings();
                }));

        // Info section
        containerEl.createEl('h3', { text: 'Usage' });
        const infoEl = containerEl.createEl('div');

        const p1 = infoEl.createEl('p');
        p1.createEl('strong', { text: 'Open ALL files:' });
        p1.appendText(' When enabled (default), all files open in new tabs. When disabled, only specific file types and sources open in new tabs based on their settings.');

        const p2 = infoEl.createEl('p');
        p2.createEl('strong', { text: 'Individual Settings:' });
        p2.appendText(' Canvas, graph, search results, tagged files, and specified extensions can be configured to open in new tabs when "Open ALL files" is disabled.');

        const p3 = infoEl.createEl('p');
        p3.createEl('strong', { text: 'Tags & Extensions:' });
        p3.appendText(' Files with specified tags or extensions will always open in new tabs (overrides other settings).');
    }
}
