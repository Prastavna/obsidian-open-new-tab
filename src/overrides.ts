import { TFile, Notice, Plugin, WorkspaceLeaf, View } from 'obsidian';
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
        // Monitor for view changes to handle graph and canvas
        this.app.workspace.on('layout-change', () => {
            this.handleSpecialViews();
        });

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

    private handleSpecialViews() {
        // Handle graph view opening
        if (this.settings.openGraphInNewTab) {
            const graphLeaves = this.app.workspace.getLeavesOfType('graph');
            graphLeaves.forEach((leaf: WorkspaceLeaf) => {
                if (!leaf.parent || (leaf.parent as any).children.length <= 1) return;

                // Move to new tab if sharing space with other views
                const newLeaf = this.app.workspace.getLeaf('tab');
                newLeaf.setViewState(leaf.view.getState() as any);
                leaf.detach();

                if (this.settings.showNotifications) {
                    new Notice('Graph moved to new tab');
                }
            });
        }
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
            if (searchView && searchView.containerEl && !searchView._newTabPatched) {
                this.patchSearchResults(searchView);
            }
        });

        // Also handle when search is opened later
        this.app.workspace.on('layout-change', () => {
            const searchLeaves = this.app.workspace.getLeavesOfType('search');
            searchLeaves.forEach((leaf: WorkspaceLeaf) => {
                const searchView = (leaf as any).view;
                if (searchView && searchView.containerEl && !searchView._newTabPatched) {
                    this.patchSearchResults(searchView);
                }
            });
        });
    }

    private patchSearchResults(searchView: any) {
        if (searchView._newTabPatched) return;

        searchView._newTabPatched = true;

        // Try to override the search view's file opening method first
        this.overrideSearchViewMethods(searchView);

        // For search views, we need to use DOM event listeners
        // since method patching doesn't work reliably
        this.patchSearchDomEvents(searchView);
    }

    private overrideSearchViewMethods(searchView: any) {
        // Try to find and override the search view's file opening methods
        if (searchView.onFileClick) {
            const originalOnFileClick = searchView.onFileClick.bind(searchView);
            searchView.onFileClick = async (file: TFile, event: MouseEvent) => {
                if (this.fileUtils.shouldOpenFileInNewTab(file, 'search')) {
                    event.preventDefault();
                    event.stopImmediatePropagation();
                    event.stopPropagation();

                    console.log('Opening file from search view method:', file.path);
                    const newLeaf = this.app.workspace.getLeaf('tab');
                    await newLeaf.openFile(file);

                    if (this.settings.showNotifications) {
                        new Notice(`Opening ${file.name} from search in new tab`);
                    }
                    return false;
                }
                return originalOnFileClick(file, event);
            };
        }

        // Also try other common method names
        const methodNames = ['handleFileClick', 'openFile', 'onResultClick'];
        methodNames.forEach(methodName => {
            if (searchView[methodName]) {
                const originalMethod = searchView[methodName].bind(searchView);
                searchView[methodName] = async (...args: any[]) => {
                    const file = args.find(arg => arg instanceof TFile);
                    const event = args.find(arg => arg instanceof MouseEvent);

                    if (file && this.fileUtils.shouldOpenFileInNewTab(file, 'search')) {
                        if (event) {
                            event.preventDefault();
                            event.stopImmediatePropagation();
                            event.stopPropagation();
                        }

                        console.log(`Opening file from search view ${methodName}:`, file.path);
                        const newLeaf = this.app.workspace.getLeaf('tab');
                        await newLeaf.openFile(file);

                        if (this.settings.showNotifications) {
                            new Notice(`Opening ${file.name} from search in new tab`);
                        }
                        return;
                    }
                    return originalMethod(...args);
                };
            }
        });
    }

    private patchSearchDomEvents(searchView: any) {
        // Wait for the search results to be rendered
        const searchContainer = searchView.containerEl;

        if (!searchContainer) return;

        // Use event delegation on the search container with capture phase
        // Also try to patch individual elements
        this.patchIndividualSearchResults(searchView);

        // Debug: Log existing event listeners and search view methods
        console.log('Search container event listeners:', searchContainer);
        console.log('Search view methods:', Object.getOwnPropertyNames(searchView).filter(name => typeof searchView[name] === 'function'));

        searchContainer.addEventListener('click', async (event: Event) => {
            const target = event.target as HTMLElement;

            // Find the closest clickable search result element
            const searchResult = target.closest('.search-result, .search-result-file, .tree-item, [data-path]');

            if (!searchResult) return;

            console.log('Search result clicked:', searchResult, 'Target:', target, 'Text:', searchResult.textContent);

            // Try to find the file from the element
            let filePath = (searchResult as HTMLElement).getAttribute('data-path');

            if (!filePath) {
                // Try to find it in child elements
                const pathElement = searchResult.querySelector('[data-path]');
                filePath = pathElement?.getAttribute('data-path') || '';
            }

            // If still no path, try various other methods
            if (!filePath) {
                // Try to get from aria-label or other attributes
                filePath = (searchResult as HTMLElement).getAttribute('aria-label') ||
                          (searchResult as HTMLElement).getAttribute('title') || '';

            // If still no path, try to extract from text content
            if (!filePath) {
                // First try to get text from tree-item-inner specifically
                const treeItemInner = searchResult.querySelector('.tree-item-inner');
                let textContent = treeItemInner?.textContent?.trim();

                // Fallback to general text content
                if (!textContent) {
                    textContent = searchResult.textContent?.trim();
                }

                if (textContent) {
                    // Remove any extra content like match counts
                    const cleanText = textContent.replace(/\s*\d+\s*$/, '').trim();

                    // Try to find a file with this name
                    const files = this.app.vault.getFiles();
                    const matchingFile = files.find(file =>
                        file.name === cleanText ||
                        file.basename === cleanText
                    );
                    if (matchingFile) {
                        filePath = matchingFile.path;
                    }
                }
            }
            }

            if (!filePath) return;

            const file = this.app.vault.getAbstractFileByPath(filePath);
            if (!(file instanceof TFile)) return;

            // Check if we should open in new tab
            if (this.fileUtils.shouldOpenFileInNewTab(file, 'search')) {
                console.log('Opening file in new tab from search:', file.path);
                event.preventDefault();
                event.stopImmediatePropagation();
                event.stopPropagation();

                // Open in new tab
                const newLeaf = this.app.workspace.getLeaf('tab');
                await newLeaf.openFile(file);

                if (this.settings.showNotifications) {
                    new Notice(`Opening ${file.name} from search in new tab`);
                }

                return false; // Additional prevention
            } else {
                console.log('File should open normally:', file.path);
            }
        }, true); // Use capture phase
    }

    private patchIndividualSearchResults(searchView: any) {
        // Use MutationObserver to watch for new search results
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        const element = node as Element;
                        // Look for search result elements
                        const searchResults = element.querySelectorAll('.tree-item.search-result, .search-result-file-title');
                        searchResults.forEach(result => this.patchSearchResultElement(result as HTMLElement));

                        // Also check if this node itself is a search result
                        if (element.classList.contains('tree-item') && element.classList.contains('search-result')) {
                            this.patchSearchResultElement(element as HTMLElement);
                        }
                        if (element.classList.contains('search-result-file-title')) {
                            this.patchSearchResultElement(element as HTMLElement);
                        }
                    }
                });
            });
        });

        // Start observing
        if (searchView.containerEl) {
            observer.observe(searchView.containerEl, {
                childList: true,
                subtree: true
            });
        }

        // Patch existing results
        const existingResults = searchView.containerEl?.querySelectorAll('.tree-item.search-result, .search-result-file-title') || [];
        existingResults.forEach((result: Element) => this.patchSearchResultElement(result as HTMLElement));
    }

    private patchSearchResultElement(element: HTMLElement) {
        if (element.dataset.searchPatched) return;
        element.dataset.searchPatched = 'true';

        // Store original click handler if it exists
        const originalClick = element.onclick;

        // Override the click handler
        element.onclick = async (event: Event) => {
            console.log('Search result element clicked directly:', element);

            // Extract file path (similar logic as before)
            let filePath = element.getAttribute('data-path');

            if (!filePath) {
                const treeItemInner = element.querySelector('.tree-item-inner');
                let textContent = treeItemInner?.textContent?.trim();

                if (!textContent) {
                    textContent = element.textContent?.trim();
                }

                if (textContent) {
                    const cleanText = textContent.replace(/\s*\d+\s*$/, '').trim();
                    const files = this.app.vault.getFiles();
                    const matchingFile = files.find(file =>
                        file.name === cleanText ||
                        file.basename === cleanText
                    );
                    if (matchingFile) {
                        filePath = matchingFile.path;
                    }
                }
            }

            if (filePath) {
                const file = this.app.vault.getAbstractFileByPath(filePath);
                if (file instanceof TFile && this.fileUtils.shouldOpenFileInNewTab(file, 'search')) {
                    event.preventDefault();
                    event.stopImmediatePropagation();
                    event.stopPropagation();

                    console.log('Opening file in new tab from direct click:', file.path);
                    const newLeaf = this.app.workspace.getLeaf('tab');
                    await newLeaf.openFile(file);

                    if (this.settings.showNotifications) {
                        new Notice(`Opening ${file.name} from search in new tab`);
                    }
                    return false;
                }
            }

            // Call original handler if it exists
            if (originalClick) {
                return originalClick.call(element, event);
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
