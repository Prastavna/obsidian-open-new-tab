import { TFile } from 'obsidian';
import { OpenInNewTabSettings, ExtendedApp } from './types';

export class FileUtils {
    private app: ExtendedApp;
    private settings: OpenInNewTabSettings;

    constructor(app: ExtendedApp, settings: OpenInNewTabSettings) {
        this.app = app;
        this.settings = settings;
    }

    shouldOpenInNewTab(linktext: string, sourcePath: string): boolean {
        // Get the target file
        const file = this.app.metadataCache.getFirstLinkpathDest(linktext, sourcePath);
        if (!(file instanceof TFile)) return false;

        return this.shouldOpenFileInNewTab(file);
    }

    shouldOpenFileInNewTab(file: TFile, source?: 'explorer' | 'search' | 'quickswitcher' | 'other'): boolean {
        const extension = file.extension.toLowerCase();
        const currentSource = source || 'other';

        // Check canvas files
        if (extension === 'canvas') {
            return this.settings.openCanvasInNewTab;
        }

        // Check source-specific settings
        switch (currentSource) {
            case 'explorer':
                if (!this.settings.openFromExplorerInNewTab) return false;
                break;
            case 'search':
                if (!this.settings.openFromSearchInNewTab) return false;
                break;
            case 'quickswitcher':
                if (!this.settings.openFromQuickSwitcherInNewTab) return false;
                break;
        }

        // Check if file has any of the specified tags
        if (this.settings.tagsForNewTab && this.hasMatchingTag(file)) {
            return true;
        }

        // Check regular files (markdown, etc.)
        if (extension === 'md' || extension === 'txt' || !extension) {
            return this.settings.openFilesInNewTab;
        }

        // Default to files setting for other file types
        return this.settings.openFilesInNewTab;
    }

    hasMatchingTag(file: TFile): boolean {
        if (!this.settings.tagsForNewTab) return false;

        // Parse the configured tags
        const configuredTags = this.settings.tagsForNewTab
            .split(',')
            .map(tag => tag.trim().toLowerCase())
            .filter(tag => tag.length > 0);

        if (configuredTags.length === 0) return false;

        // Get file tags from metadata cache
        const fileCache = this.app.metadataCache.getFileCache(file);
        const fileTags = fileCache?.frontmatter?.tags || [];

        // Also check for inline tags
        const inlineTags = fileCache?.tags?.map((tag: { tag: string }) => tag.tag) || [];

        // Combine all tags
        const allFileTags = [...fileTags, ...inlineTags].map(tag => tag.toLowerCase());

        // Check if any configured tag matches any file tag
        return configuredTags.some((configTag: string) =>
            allFileTags.some((fileTag: string) =>
                fileTag === configTag || fileTag.startsWith(configTag + '/')
            )
        );
    }
}