import { Plugin, TFile, WorkspaceLeaf, Notice, PluginSettingTab, Setting } from 'obsidian';

interface OpenInNewTabSettings {
    openFilesInNewTab: boolean;
    openCanvasInNewTab: boolean;
    openGraphInNewTab: boolean;
    openFromExplorerInNewTab: boolean;
    showNotifications: boolean;
}

const DEFAULT_SETTINGS: OpenInNewTabSettings = {
    openFilesInNewTab: true,
    openCanvasInNewTab: true,
    openGraphInNewTab: true,
    openFromExplorerInNewTab: true,
    showNotifications: false
};

export default class OpenInNewTabPlugin extends Plugin {
    settings: OpenInNewTabSettings;
    private originalOpenFile: any;
    private originalOpenLinkText: any;
    private fileExplorerHandler: any;

    async onload() {
        console.log('Loading Open in New Tab plugin');
        
        await this.loadSettings();

        // Add settings tab
        this.addSettingTab(new OpenInNewTabSettingTab(this.app, this));

        // Override various opening methods
        this.overrideOpenLinkText();
        this.overrideFileOpening();
        this.overrideSpecialViews();
        this.overrideFileExplorer();

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
        this.restoreOriginalMethods();
        
        // Clean up file explorer observer
        if (this.fileExplorerHandler && this.fileExplorerHandler.disconnect) {
            this.fileExplorerHandler.disconnect();
        }
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

    private overrideOpenLinkText() {
        const workspace = this.app.workspace;
        
        // Store original method
        this.originalOpenLinkText = workspace.openLinkText.bind(workspace);
        
        // Override openLinkText method
        workspace.openLinkText = async (linktext: string, sourcePath: string, newLeaf?: boolean, openViewState?: any) => {
            // Only override if not already forcing new leaf
            if (!newLeaf && this.shouldOpenInNewTab(linktext, sourcePath, 'link')) {
                newLeaf = true;
                if (this.settings.showNotifications) {
                    new Notice(`Opening ${linktext} in new tab`);
                }
            }
            
            return this.originalOpenLinkText(linktext, sourcePath, newLeaf, openViewState);
        };
    }

    private overrideFileOpening() {
        const workspace = this.app.workspace;
        
        // Store original openFile method
        this.originalOpenFile = workspace.openFile?.bind(workspace);
        
        // Override openFile method
        workspace.openFile = async (file: TFile, openViewState?: any) => {
            if (this.shouldOpenFileInNewTab(file)) {
                // Force opening in new leaf
                const newLeaf = workspace.getLeaf('tab');
                if (this.settings.showNotifications) {
                    new Notice(`Opening ${file.name} in new tab`);
                }
                return newLeaf.openFile(file, openViewState);
            }
            return this.originalOpenFile(file, openViewState);
        };
    }

    private overrideSpecialViews() {
        // Monitor for view changes to handle graph and canvas
        this.registerEvent(
            this.app.workspace.on('layout-change', () => {
                this.handleSpecialViews();
            })
        );

        // Override workspace methods for special views
        const workspace = this.app.workspace;
        const originalGetLeaf = workspace.getLeaf.bind(workspace);
        
        // Intercept when graph view is about to be opened
        this.addCommand({
            id: 'graph',
            name: 'Open graph view',
            checkCallback: (checking: boolean) => {
                if (checking) return true;
                
                if (this.settings.openGraphInNewTab) {
                    const leaf = workspace.getLeaf('tab');
                    leaf.setViewState({ type: 'graph' });
                    if (this.settings.showNotifications) {
                        new Notice('Graph view opened in new tab');
                    }
                } else {
                    const leaf = workspace.getLeaf();
                    leaf.setViewState({ type: 'graph' });
                }
                return false;
            }
        });
    }

    private overrideFileExplorer() {
        // Wait for file explorer to be ready
        this.app.workspace.onLayoutReady(() => {
            this.setupFileExplorerHandler();
        });
    }

    private setupFileExplorerHandler() {
        // Get file explorer leaf
        const fileExplorers = this.app.workspace.getLeavesOfType('file-explorer');
        
        fileExplorers.forEach(leaf => {
            const fileExplorer = (leaf as any).view;
            if (fileExplorer && fileExplorer.fileItems) {
                // Override the file explorer's file opening behavior
                const originalOnFileClick = fileExplorer.onFileMenu?.bind(fileExplorer);
                
                // Patch the tree component's click handler
                this.patchFileExplorerClicks(fileExplorer);
            }
        });

        // Also handle when file explorer is opened later
        this.registerEvent(
            this.app.workspace.on('layout-change', () => {
                const fileExplorers = this.app.workspace.getLeavesOfType('file-explorer');
                fileExplorers.forEach(leaf => {
                    const fileExplorer = (leaf as any).view;
                    if (fileExplorer && !fileExplorer._newTabPatched) {
                        this.patchFileExplorerClicks(fileExplorer);
                    }
                });
            })
        );
    }

    private patchFileExplorerClicks(fileExplorer: any) {
        if (fileExplorer._newTabPatched) return;
        
        fileExplorer._newTabPatched = true;
        
        // Store original click handler
        const originalOnClick = fileExplorer.onFileClick?.bind(fileExplorer) || 
                               fileExplorer.handleFileClick?.bind(fileExplorer);
        
        // Create our custom click handler
        const customClickHandler = async (file: TFile, event: MouseEvent) => {
            // Check if we should open in new tab
            if (this.settings.openFromExplorerInNewTab && this.shouldOpenFileInNewTab(file)) {
                event.preventDefault();
                event.stopPropagation();
                
                // Open in new tab
                const newLeaf = this.app.workspace.getLeaf('tab');
                await newLeaf.openFile(file);
                
                if (this.settings.showNotifications) {
                    new Notice(`Opening ${file.name} from explorer in new tab`);
                }
                return;
            }
            
            // Otherwise use original behavior
            if (originalOnClick) {
                return originalOnClick(file, event);
            }
        };

        // Patch the click handler
        if (fileExplorer.onFileClick) {
            fileExplorer.onFileClick = customClickHandler;
        } else if (fileExplorer.handleFileClick) {
            fileExplorer.handleFileClick = customClickHandler;
        }

        // Also patch tree item clicks
        this.patchTreeItemClicks(fileExplorer);
    }

    private patchTreeItemClicks(fileExplorer: any) {
        // Monitor for tree item creation and patch their click handlers
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        const element = node as Element;
                        // Look for file tree items
                        const treeItems = element.querySelectorAll('.tree-item-self[data-path]');
                        treeItems.forEach(item => this.patchTreeItem(item as HTMLElement));
                        
                        // Also check if this node itself is a tree item
                        if (element.classList.contains('tree-item-self') && element.hasAttribute('data-path')) {
                            this.patchTreeItem(element as HTMLElement);
                        }
                    }
                });
            });
        });

        // Start observing the file explorer
        if (fileExplorer.containerEl) {
            observer.observe(fileExplorer.containerEl, {
                childList: true,
                subtree: true
            });
        }

        // Patch existing items
        const existingItems = fileExplorer.containerEl?.querySelectorAll('.tree-item-self[data-path]') || [];
        existingItems.forEach(item => this.patchTreeItem(item as HTMLElement));
    }

    private patchTreeItem(element: HTMLElement) {
        if (element.dataset.newTabPatched) return;
        element.dataset.newTabPatched = 'true';

        element.addEventListener('click', async (event) => {
            const path = element.dataset.path;
            if (!path) return;

            const file = this.app.vault.getAbstractFileByPath(path);
            if (!(file instanceof TFile)) return;

            // Check if we should intercept this click
            if (this.settings.openFromExplorerInNewTab && this.shouldOpenFileInNewTab(file)) {
                event.preventDefault();
                event.stopPropagation();

                // Open in new tab
                const newLeaf = this.app.workspace.getLeaf('tab');
                await newLeaf.openFile(file);

                if (this.settings.showNotifications) {
                    new Notice(`Opening ${file.name} from explorer in new tab`);
                }
            }
        }, true); // Use capture phase
    }

    private shouldOpenInNewTab(linktext: string, sourcePath: string, context: 'link' | 'explorer'): boolean {
        // Get the target file
        const file = this.app.metadataCache.getFirstLinkpathDest(linktext, sourcePath);
        if (!(file instanceof TFile)) return false;

        return this.shouldOpenFileInNewTab(file);
    }

    private shouldOpenFileInNewTab(file: TFile): boolean {
        const extension = file.extension.toLowerCase();
        
        // Check canvas files
        if (extension === 'canvas') {
            return this.settings.openCanvasInNewTab;
        }
        
        // Check regular files (markdown, etc.)
        if (extension === 'md' || extension === 'txt' || !extension) {
            return this.settings.openFilesInNewTab;
        }
        
        // Default to files setting for other file types
        return this.settings.openFilesInNewTab;
    }

    private handleSpecialViews() {
        // Handle graph view opening
        if (this.settings.openGraphInNewTab) {
            const graphLeaves = this.app.workspace.getLeavesOfType('graph');
            graphLeaves.forEach(leaf => {
                if (!leaf.parent || leaf.parent.children.length <= 1) return;
                
                // Move to new tab if sharing space with other views
                const newLeaf = this.app.workspace.getLeaf('tab');
                newLeaf.setViewState(leaf.view.getState());
                leaf.detach();
                
                if (this.settings.showNotifications) {
                    new Notice('Graph moved to new tab');
                }
            });
        }
    }

    private restoreOriginalMethods() {
        const workspace = this.app.workspace;
        
        // Restore original methods
        if (this.originalOpenFile) {
            workspace.openFile = this.originalOpenFile;
        }
        
        if (this.originalOpenLinkText) {
            workspace.openLinkText = this.originalOpenLinkText;
        }
    }
}

export class OpenInNewTabSettingTab extends PluginSettingTab {
    plugin: OpenInNewTabPlugin;

    constructor(app: any, plugin: OpenInNewTabPlugin) {
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

        // File types section
        containerEl.createEl('h3', { text: 'File Types' });

        new Setting(containerEl)
            .setName('Open files in new tab')
            .setDesc('Always open markdown files and other documents in a new tab')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.openFilesInNewTab)
                .onChange(async (value) => {
                    this.plugin.settings.openFilesInNewTab = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Open canvas in new tab')
            .setDesc('Always open canvas files in a new tab')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.openCanvasInNewTab)
                .onChange(async (value) => {
                    this.plugin.settings.openCanvasInNewTab = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Open graph view in new tab')
            .setDesc('Always open the graph view in a new tab')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.openGraphInNewTab)
                .onChange(async (value) => {
                    this.plugin.settings.openGraphInNewTab = value;
                    await this.plugin.saveSettings();
                }));

        // Source section
        containerEl.createEl('h3', { text: 'Opening Sources' });

        new Setting(containerEl)
            .setName('Open from file explorer in new tab')
            .setDesc('When clicking files in the file explorer sidebar, open them in new tabs')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.openFromExplorerInNewTab)
                .onChange(async (value) => {
                    this.plugin.settings.openFromExplorerInNewTab = value;
                    await this.plugin.saveSettings();
                }));

        // General section
        containerEl.createEl('h3', { text: 'General' });

        new Setting(containerEl)
            .setName('Show notifications')
            .setDesc('Show notifications when opening items in new tabs')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.showNotifications)
                .onChange(async (value) => {
                    this.plugin.settings.showNotifications = value;
                    await this.plugin.saveSettings();
                }));

        // Info section
        containerEl.createEl('h3', { text: 'Usage' });
        const infoEl = containerEl.createEl('div');
        infoEl.innerHTML = `
            <p><strong>Commands:</strong> Use the command palette (Ctrl/Cmd+P) to quickly toggle these settings.</p>
            <p><strong>File Types:</strong> Controls which file types open in new tabs when accessed via any source.</p>
            <p><strong>Sources:</strong> Controls which sources (file explorer, quick switcher, search) should open files in new tabs.</p>
            <p><strong>Behavior:</strong> A file will open in a new tab only if both its file type setting AND source setting are enabled.</p>
        `;
    }
}
