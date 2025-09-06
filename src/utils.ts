import { TFile } from 'obsidian';
import { OpenInNewTabSettings, ExtendedApp, TagInfo } from './types';

export class FileUtils {
    private app: ExtendedApp;
    private settings: OpenInNewTabSettings;

    constructor(app: ExtendedApp, settings: OpenInNewTabSettings) {
        this.app = app;
        this.settings = settings;
    }

    updateSettings(settings: OpenInNewTabSettings) {
        this.settings = settings;
    }

    shouldOpenInNewTab(linktext: string, sourcePath: string): boolean {
        // Get the target file
        const file = this.app.metadataCache.getFirstLinkpathDest(linktext, sourcePath);
        if (!(file instanceof TFile)) return false;

        return this.shouldOpenFileInNewTab(file);
    }

    shouldOpenFileInNewTab(file: TFile, source?: 'explorer' | 'search' | 'quickswitcher' | 'other'): boolean {
        // If open all files in new tab is enabled, return true for all files
        if (this.settings.openAllFilesInNewTab) {
            return true;
        }

        const extension = file.extension.toLowerCase();
        const currentSource = source || 'other';

        // Check canvas files
        if (extension === 'canvas') {
            return this.settings.openCanvasInNewTab;
        }

        // Check if file has any of the specified tags (tags override source settings)
        if (this.settings.tagsForNewTab && this.hasMatchingTag(file)) {
            return true;
        }

        // Check if file extension matches any of the specified extensions
        if (this.settings.extensionsForNewTab && this.hasMatchingExtension(file)) {
            return true;
        }

        // Check source-specific settings
        switch (currentSource) {
            case 'search':
                return this.settings.openFromSearchInNewTab;
        }

        // For all other cases, return false (don't open in new tab by default)
        return false;
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
        const inlineTags = fileCache?.tags?.map((tag: TagInfo) => tag.tag) || [];

        // Combine all tags
        const allFileTags = [...fileTags, ...inlineTags].map(tag => tag.toLowerCase());

        // Check if any configured tag matches any file tag
        return configuredTags.some((configTag: string) =>
            allFileTags.some((fileTag: string) =>
                fileTag === configTag || fileTag.startsWith(configTag + '/')
            )
        );
    }

    hasMatchingExtension(file: TFile): boolean {
        if (!this.settings.extensionsForNewTab) return false;

        // Parse the configured extensions
        const configuredExtensions = this.settings.extensionsForNewTab
            .split(',')
            .map(ext => ext.trim().toLowerCase().replace(/^\./, '')) // Remove leading dots and normalize
            .filter(ext => ext.length > 0);

        if (configuredExtensions.length === 0) return false;

        const fileExtension = file.extension.toLowerCase();

        // Check if file extension matches any configured extension
        return configuredExtensions.includes(fileExtension);
    }
}