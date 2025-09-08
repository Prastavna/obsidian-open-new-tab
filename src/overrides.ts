import { TFile, Notice, WorkspaceLeaf, OpenViewState } from 'obsidian';
import { FileUtils } from './utils';
import { OpenInNewTabSettings, ExtendedApp, FileExplorerView, SearchView, ExtendedWorkspace, QuickSwitcherModalConstructor } from './types';

export class OverrideManager {
    private app: ExtendedApp;
    private settings: OpenInNewTabSettings;
    private fileUtils: FileUtils;
    private originalOpenFile: ((file: TFile, openViewState?: OpenViewState) => Promise<void>) | null;
    private originalOpenLinkText: ((linktext: string, sourcePath: string, newLeaf?: boolean, openViewState?: OpenViewState) => Promise<void>) | null;
    private fileExplorerHandler: MutationObserver | null;

    constructor(app: ExtendedApp, settings: OpenInNewTabSettings, fileUtils: FileUtils) {
        this.app = app;
        this.settings = settings;
        this.fileUtils = fileUtils;
    }

    updateSettings(settings: OpenInNewTabSettings) {
        this.settings = settings;
    }

    overrideOpenLinkText() {
        const workspace = this.app.workspace;

        // Store original method
        this.originalOpenLinkText = workspace.openLinkText.bind(workspace);

        // Override openLinkText method
        workspace.openLinkText = async (linktext: string, sourcePath: string, newLeaf?: boolean, openViewState?: OpenViewState) => {
            // Only override if not already forcing new leaf
            if (!newLeaf && this.fileUtils.shouldOpenInNewTab(linktext, sourcePath)) {
                newLeaf = true;
                if (this.settings.showNotifications) {
                    new Notice(`Opening ${linktext} in new tab`);
                }
            }

            return this.originalOpenLinkText!(linktext, sourcePath, newLeaf, openViewState);
        };
    }

    overrideFileOpening() {
        const workspace = this.app.workspace;

        // Store original openFile method
        this.originalOpenFile = (workspace as ExtendedWorkspace).openFile?.bind(workspace);

        // Override openFile method
        (workspace as ExtendedWorkspace).openFile = async (file: TFile, openViewState?: OpenViewState) => {
            if (this.fileUtils.shouldOpenFileInNewTab(file)) {
                // Use smart tab management
                const emptyLeaf = this.fileUtils.findEmptyLeaf();
                const existingLeaf = this.fileUtils.findExistingLeaf(file);

                if (emptyLeaf) {
                    this.app.workspace.revealLeaf(emptyLeaf);
                    if (this.settings.showNotifications) {
                        new Notice(`Opening ${file.name} in new tab`);
                    }
                    return emptyLeaf.openFile(file, openViewState);
                } else if (existingLeaf) {
                    this.app.workspace.revealLeaf(existingLeaf);
                    if (this.settings.showNotifications) {
                        new Notice(`Switched to existing tab for ${file.name}`);
                    }
                    return Promise.resolve();
                } else {
                    const newLeaf = workspace.getLeaf('tab');
                    if (this.settings.showNotifications) {
                        new Notice(`Opening ${file.name} in new tab`);
                    }
                    return newLeaf.openFile(file, openViewState);
                }
            }
            return this.originalOpenFile!(file, openViewState);
        };
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
                const fileExplorer = (leaf.view as unknown) as FileExplorerView;
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
            const fileExplorer = (leaf.view as unknown) as FileExplorerView;
                if (fileExplorer && !fileExplorer._newTabPatched) {
                    this.patchFileExplorerClicks(fileExplorer);
                }
            });
        });
    }

    private patchFileExplorerClicks(fileExplorer: FileExplorerView) {
        if (fileExplorer._newTabPatched) return;

        fileExplorer._newTabPatched = true;

        // Store original click handler
        const originalOnClick = fileExplorer.onFileClick?.bind(fileExplorer) ||
                               fileExplorer.handleFileClick?.bind(fileExplorer);

        // Create our custom click handler
        const customClickHandler = async (file: TFile, event: MouseEvent) => {
            // Check if we should open in new tab
            if (this.fileUtils.shouldOpenFileInNewTab(file)) {
                event.preventDefault();
                event.stopPropagation();

                // Use smart tab management
                const emptyLeaf = this.fileUtils.findEmptyLeaf();
                const existingLeaf = this.fileUtils.findExistingLeaf(file);

                if (emptyLeaf) {
                    this.app.workspace.revealLeaf(emptyLeaf);
                    await emptyLeaf.openFile(file);
                    if (this.settings.showNotifications) {
                        new Notice(`Opening ${file.name} in new tab`);
                    }
                } else if (existingLeaf) {
                    this.app.workspace.revealLeaf(existingLeaf);
                    if (this.settings.showNotifications) {
                        new Notice(`Switched to existing tab for ${file.name}`);
                    }
                } else {
                    const newLeaf = this.app.workspace.getLeaf('tab');
                    await newLeaf.openFile(file);
                    if (this.settings.showNotifications) {
                        new Notice(`Opening ${file.name} from explorer in new tab`);
                    }
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

    private patchTreeItemClicks(fileExplorer: FileExplorerView) {
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
            if (this.fileUtils.shouldOpenFileInNewTab(file)) {
                event.preventDefault();
                event.stopPropagation();

                // Use smart tab management
                const emptyLeaf = this.fileUtils.findEmptyLeaf();
                const existingLeaf = this.fileUtils.findExistingLeaf(file);

                if (emptyLeaf) {
                    this.app.workspace.revealLeaf(emptyLeaf);
                    await emptyLeaf.openFile(file);
                    if (this.settings.showNotifications) {
                        new Notice(`Opening ${file.name} in new tab`);
                    }
                } else if (existingLeaf) {
                    this.app.workspace.revealLeaf(existingLeaf);
                    if (this.settings.showNotifications) {
                        new Notice(`Switched to existing tab for ${file.name}`);
                    }
                } else {
                    const newLeaf = this.app.workspace.getLeaf('tab');
                    await newLeaf.openFile(file);
                    if (this.settings.showNotifications) {
                        new Notice(`Opening ${file.name} from explorer in new tab`);
                    }
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
                const searchView = (leaf.view as unknown) as SearchView;
            if (searchView && searchView.resultDomLookup && !searchView._newTabPatched) {
                this.patchSearchResults(searchView);
            }
        });

        // Also handle when search is opened later
        this.app.workspace.on('layout-change', () => {
		const searchLeaves = this.app.workspace.getLeavesOfType('search');
        searchLeaves.forEach((leaf: WorkspaceLeaf) => {
				console.log({leaf});
            const searchView = (leaf.view as unknown) as SearchView;
                if (searchView && searchView.resultDomLookup && !searchView._newTabPatched) {
                    this.patchSearchResults(searchView);
                }
            });
        });
    }

    private patchSearchResults(searchView: SearchView) {
        if (searchView._newTabPatched) return;

        searchView._newTabPatched = true;

        // Store original method
        const originalOnFileClick = searchView.onFileClick?.bind(searchView);

        // Override the file click handler
        if (searchView.onFileClick) {
            searchView.onFileClick = async (file: TFile, event: MouseEvent) => {
			console.log(file);
            // Check if we should open in new tab
            if (this.fileUtils.shouldOpenFileInNewTab(file, 'search')) {
                event.preventDefault();
                event.stopPropagation();

                // Use smart tab management
                const emptyLeaf = this.fileUtils.findEmptyLeaf();
                const existingLeaf = this.fileUtils.findExistingLeaf(file);

                if (emptyLeaf) {
                    this.app.workspace.revealLeaf(emptyLeaf);
                    await emptyLeaf.openFile(file);
                    if (this.settings.showNotifications) {
                        new Notice(`Opening ${file.name} in new tab`);
                    }
                } else if (existingLeaf) {
                    this.app.workspace.revealLeaf(existingLeaf);
                    if (this.settings.showNotifications) {
                        new Notice(`Switched to existing tab for ${file.name}`);
                    }
                } else {
                    const newLeaf = this.app.workspace.getLeaf('tab');
                    await newLeaf.openFile(file);
                    if (this.settings.showNotifications) {
                        new Notice(`Opening ${file.name} from search in new tab`);
                    }
                }
                return;
            }

            // Otherwise use original behavior
            if (originalOnFileClick) {
                return originalOnFileClick(file, event);
            }
            };
        }
    }

    overrideQuickSwitcher() {
        // Override the quick switcher modal
        const originalQuickSwitcher = (this.app as ExtendedApp).internalPlugins?.plugins?.switcher?.instance?.QuickSwitcherModal;

        if (originalQuickSwitcher) {
            // eslint-disable-next-line @typescript-eslint/no-this-alias
            const manager = this;
            (this.app as ExtendedApp).internalPlugins!.plugins.switcher!.instance!.QuickSwitcherModal = class extends (originalQuickSwitcher as QuickSwitcherModalConstructor) {
                async openFile(file: TFile, newLeaf?: boolean) {
                    // Check if we should open in new tab
                    if (!newLeaf && manager.fileUtils.shouldOpenFileInNewTab(file, 'quickswitcher')) {
                        // Use smart tab management
                        const emptyLeaf = manager.fileUtils.findEmptyLeaf();
                        const existingLeaf = manager.fileUtils.findExistingLeaf(file);

                        if (emptyLeaf) {
                            manager.app.workspace.revealLeaf(emptyLeaf);
                            await emptyLeaf.openFile(file);
                            if (manager.settings.showNotifications) {
                                new Notice(`Opening ${file.name} in new tab`);
                            }
                            return;
                        } else if (existingLeaf) {
                            manager.app.workspace.revealLeaf(existingLeaf);
                            if (manager.settings.showNotifications) {
                                new Notice(`Switched to existing tab for ${file.name}`);
                            }
                            return;
                        } else {
                            newLeaf = true;
                            if (manager.settings.showNotifications) {
                                new Notice(`Opening ${file.name} from quick switcher in new tab`);
                            }
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
            (workspace as ExtendedWorkspace).openFile = this.originalOpenFile!;
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
