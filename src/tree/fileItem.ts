import * as path from 'path';
import * as vscode from 'vscode';

/** A directory inside a library folder, shown in the file-system view. */
export class FolderItem extends vscode.TreeItem {
  constructor(public readonly dirPath: string, label?: string, expanded = false) {
    super(
      label || path.basename(dirPath) || dirPath,
      expanded ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed
    );
    this.contextValue = 'folder';
    this.resourceUri = vscode.Uri.file(dirPath);
    this.iconPath = vscode.ThemeIcon.Folder;
    this.tooltip = dirPath;
  }
}

/** Any other file on disk — opens in a normal editor tab. */
export class FileItem extends vscode.TreeItem {
  constructor(public readonly filePath: string) {
    super(path.basename(filePath), vscode.TreeItemCollapsibleState.None);
    this.contextValue = 'file';
    this.resourceUri = vscode.Uri.file(filePath);
    this.iconPath = vscode.ThemeIcon.File;
    this.tooltip = filePath;
    this.command = {
      command: 'vscode.open',
      title: 'Open File',
      arguments: [vscode.Uri.file(filePath)],
    };
  }
}

/** A book file on disk, shown in the file-system view. */
export class BookFileItem extends vscode.TreeItem {
  constructor(public readonly filePath: string) {
    super(path.basename(filePath), vscode.TreeItemCollapsibleState.None);
    this.contextValue = 'bookFile';
    this.resourceUri = vscode.Uri.file(filePath);
    this.iconPath = vscode.ThemeIcon.File;
    this.tooltip = filePath;
    this.command = {
      command: 'openReader.openToc',
      title: 'Open Table of Contents',
      arguments: [filePath],
    };
  }
}
