import { TFile, Notice, Plugin, WorkspaceLeaf } from 'obsidian';
import { FileUtils } from './utils';
import { OpenInNewTabSettings, ExtendedApp, FileExplorerView, SearchView } from './types';

export class OverrideManager {
    private app: ExtendedApp;
    private plugin: Plugin & { settings: OpenInNewTabSettings; saveSettings: () => Promise<void> };
    private settings: OpenInNewTabSettings;
    private fileUtils: FileUtils;
    private originalOpenFile: any;
    private originalOpenLinkText: any;
    private fileExplorerHandler: any;

    constructor(app: ExtendedApp, plugin: Plugin & { settings: OpenInNewTabSettings; saveSettings: () => Promise<void> }, settings: OpenInNewTabSettings, fileUtils: FileUtils) {
        this.app = app;
        this.plugin = plugin;
        this.settings = settings;
        this.fileUtils = fileUtils;
    }

    overrideOpenLinkText() {
        const workspace = this.app.workspace;

        // Store original method
        this.originalOpenLinkText = workspace.openLinkText.bind(workspace);

        // Override openLinkText method
        workspace.openLinkText = async (linktext: string, sourcePath: string, newLeaf?: boolean, openViewState?: any) => {
            // Only override if not already forcing new leaf
            if (!newLeaf && this.fileUtils.shouldOpenInNewTab(linktext, sourcePath)) {
                newLeaf = true;
                if (this.settings.showNotifications) {
                    new Notice(`Opening ${linktext} in new tab`);
                }
            }

            return this.originalOpenLinkText(linktext, sourcePath, newLeaf, openViewState);
        };
    }

    overrideFileOpening() {
        const workspace = this.app.workspace;

        // Store original openFile method
        this.originalOpenFile = (workspace as any).openFile?.bind(workspace);

        // Override openFile method
        (workspace as any).openFile = async (file: TFile, openViewState?: any) => {
            if (this.fileUtils.shouldOpenFileInNewTab(file)) {
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

    overrideSpecialViews() {
        // Override workspace methods for special views
        const workspace = this.app.workspace;

        // Intercept when graph view is about to be opened
        this.plugin.addCommand({
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

    overrideFileExplorer() {
        // Wait for file explorer to be ready
        this.app.workspace.onLayoutReady(() => {
            this.setupFileExplorerHandler();
        });
    }

    private setupFileExplorerHandler() {
        // Get file explorer leaf
        const fileExplorers = this.app.workspace.getLeavesOfType('file-explorer');

            fileExplorers.forEach((leaf: WorkspaceLeaf) => {
            const fileExplorer = (leaf as any).view;
            if (fileExplorer && fileExplorer.fileItems) {
                // Override the file explorer's file opening behavior
                // Patch the tree component's click handler
                this.patchFileExplorerClicks(fileExplorer);
            }
        });

        // Also handle when file explorer is opened later
        this.app.workspace.on('layout-change', () => {
            const fileExplorers = this.app.workspace.getLeavesOfType('file-explorer');
        fileExplorers.forEach((leaf: WorkspaceLeaf) => {
                const fileExplorer = (leaf as any).view;
                if (fileExplorer && !fileExplorer._newTabPatched) {
                    this.patchFileExplorerClicks(fileExplorer);
                }
            });
        });
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
            if (this.fileUtils.shouldOpenFileInNewTab(file, 'explorer')) {
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
        existingItems.forEach((item: Element) => this.patchTreeItem(item as HTMLElement));
    }

    private patchTreeItem(element: HTMLElement): void {
        if (element.dataset.newTabPatched) return;
        element.dataset.newTabPatched = 'true';

        element.addEventListener('click', async (event) => {
            const path = element.dataset.path;
            if (!path) return;

            const file = this.app.vault.getAbstractFileByPath(path);
            if (!(file instanceof TFile)) return;

            // Check if we should intercept this click
            if (this.fileUtils.shouldOpenFileInNewTab(file, 'explorer')) {
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



    overrideSearchPane() {
        // Wait for search view to be ready
        this.app.workspace.onLayoutReady(() => {
            this.setupSearchPaneHandler();
        });
    }

    private setupSearchPaneHandler() {
        // Get search leaves
        const searchLeaves = this.app.workspace.getLeavesOfType('search');

            searchLeaves.forEach((leaf: WorkspaceLeaf) => {
            const searchView = (leaf as any).view;
            if (searchView && searchView.resultDomLookup && !searchView._newTabPatched) {
                this.patchSearchResults(searchView);
            }
        });

        // Also handle when search is opened later
        this.app.workspace.on('layout-change', () => {
            const searchLeaves = this.app.workspace.getLeavesOfType('search');
        searchLeaves.forEach((leaf: WorkspaceLeaf) => {
				console.log({leaf});
                const searchView = (leaf as any).view;
                if (searchView && searchView.resultDomLookup && !searchView._newTabPatched) {
                    this.patchSearchResults(searchView);
                }
            });
        });
    }

    private patchSearchResults(searchView: any) {
        if (searchView._newTabPatched) return;

        searchView._newTabPatched = true;

        // Store original method
        const originalOnFileClick = searchView.onOpen?.bind(searchView);

        // Override the file click handler
        searchView.onOpen = async (file: TFile, event: MouseEvent) => {
			console.log(file);
            // Check if we should open in new tab
            if (this.fileUtils.shouldOpenFileInNewTab(file, 'search')) {
                event.preventDefault();
                event.stopPropagation();

                // Open in new tab
                const newLeaf = this.app.workspace.getLeaf('tab');
                await newLeaf.openFile(file);

                if (this.settings.showNotifications) {
                    new Notice(`Opening ${file.name} from search in new tab`);
                }
                return;
            }

            // Otherwise use original behavior
            if (originalOnFileClick) {
                return originalOnFileClick(file, event);
            }
        };
    }

    overrideQuickSwitcher() {
        // Override the quick switcher modal
        const originalQuickSwitcher = (this.app as any).internalPlugins?.plugins?.switcher?.instance?.QuickSwitcherModal;

        if (originalQuickSwitcher) {
            // eslint-disable-next-line @typescript-eslint/no-this-alias
            const manager = this;
            (this.app as any).internalPlugins.plugins.switcher.instance.QuickSwitcherModal = class extends originalQuickSwitcher {
                async openFile(file: TFile, newLeaf?: boolean) {
                    // Check if we should open in new tab
                    if (!newLeaf && manager.fileUtils.shouldOpenFileInNewTab(file, 'quickswitcher')) {
                        newLeaf = true;
                        if (manager.settings.showNotifications) {
                            new Notice(`Opening ${file.name} from quick switcher in new tab`);
                        }
                    }

                    return super.openFile(file, newLeaf);
                }
            };
        }
    }

    restoreOriginalMethods() {
        const workspace = this.app.workspace;

        // Restore original methods
        if (this.originalOpenFile) {
            (workspace as any).openFile = this.originalOpenFile;
        }

        if (this.originalOpenLinkText) {
            workspace.openLinkText = this.originalOpenLinkText;
        }
    }

    cleanup() {
        // Clean up file explorer observer
        if (this.fileExplorerHandler && this.fileExplorerHandler.disconnect) {
            this.fileExplorerHandler.disconnect();
        }
    }
}
