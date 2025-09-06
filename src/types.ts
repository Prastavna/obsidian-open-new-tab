import { App, Plugin, TFile, WorkspaceLeaf, Component, View, Modal } from 'obsidian';

// Obsidian API types that we use
export type ObsidianApp = App;
export type ObsidianPlugin = Plugin;
export type ObsidianTFile = TFile;
export type ObsidianWorkspaceLeaf = WorkspaceLeaf;
export type ObsidianComponent = Component;
export type ObsidianView = View;
export type ObsidianModal = Modal;

// Settings interface (defined here to avoid circular imports)
export interface OpenInNewTabSettings {
    openFilesInNewTab: boolean;
    openCanvasInNewTab: boolean;
    openGraphInNewTab: boolean;
    openFromExplorerInNewTab: boolean;
    openFromSearchInNewTab: boolean;
    openFromQuickSwitcherInNewTab: boolean;
    showNotifications: boolean;
    tagsForNewTab: string;
}

export const DEFAULT_SETTINGS: OpenInNewTabSettings = {
    openFilesInNewTab: true,
    openCanvasInNewTab: true,
    openGraphInNewTab: true,
    openFromExplorerInNewTab: true,
    openFromSearchInNewTab: true,
    openFromQuickSwitcherInNewTab: true,
    showNotifications: false,
    tagsForNewTab: ''
};

// Custom interfaces for our plugin
export interface FileExplorerView {
    fileItems?: Record<string, any>; // File items mapping
    onFileClick?: (file: TFile, event: MouseEvent) => void;
    handleFileClick?: (file: TFile, event: MouseEvent) => void;
    containerEl?: HTMLElement;
    _newTabPatched?: boolean;
}

export interface SearchView {
    resultDomLookup?: Record<string, any>; // Search result DOM lookup
    onFileClick?: (file: TFile, event: MouseEvent) => void;
    _newTabPatched?: boolean;
}

export interface QuickSwitcherModal {
    openFile(file: TFile, newLeaf?: boolean): Promise<void>;
}

export interface InternalPlugins {
    plugins: {
        switcher?: {
            instance?: {
                QuickSwitcherModal?: new () => QuickSwitcherModal;
            };
        };
    };
}

export interface ExtendedApp extends ObsidianApp {
    internalPlugins?: InternalPlugins;
    setting?: {
        open(): void;
        openTabById(id: string): void;
    };
}

// Note: Use type assertions for Obsidian internal types where needed

// Plugin-specific types
export type FileSource = 'explorer' | 'search' | 'quickswitcher' | 'other';

export interface TagInfo {
    tag: string;
}

export interface FrontmatterData {
    tags?: string[];
}

export interface FileCache {
    frontmatter?: FrontmatterData;
    tags?: TagInfo[];
}

// Custom plugin interface with our settings
export interface OpenInNewTabPlugin extends ObsidianPlugin {
    settings: OpenInNewTabSettings;
    saveSettings(): Promise<void>;
}