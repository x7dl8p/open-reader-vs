import * as vscode from 'vscode';

export const CHAPTER_SCHEME = 'open-reader-chapter';

export interface ChapterFlags {
  current: boolean;
  read: boolean;
  bookmarked: boolean;
  downloaded: boolean;
  /** Chapter of an online novel, can be downloaded. */
  online: boolean;
}

export class ChapterItem extends vscode.TreeItem {
  constructor(public readonly filePath: string, public readonly index: number, label: string, flags: ChapterFlags) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.id = `${filePath}::${index}`;
    // Space-separated flags, matched with regexes in package.json `when` clauses.
    this.contextValue = [
      'chapter',
      flags.online ? 'online' : '',
      flags.read ? 'read' : 'unread',
      flags.bookmarked ? 'bookmarked' : '',
      flags.downloaded ? 'downloaded' : '',
    ]
      .filter(Boolean)
      .join(' ');
    this.iconPath = new vscode.ThemeIcon(
      flags.current ? 'debug-stackframe-dot' : flags.bookmarked ? 'bookmark' : flags.read ? 'check' : 'circle-small'
    );
    this.description = flags.current ? 'reading' : undefined;
    // The URI carries the flags so ChapterDecorations can dim read chapters statelessly.
    const state = [flags.read && !flags.current ? 'read' : '', flags.downloaded ? 'dl' : ''].filter(Boolean).join(',');
    this.resourceUri = vscode.Uri.from({ scheme: CHAPTER_SCHEME, path: `/${index}`, query: state });
    this.tooltip = [label, flags.read ? 'Read' : 'Unread', flags.downloaded ? 'Downloaded' : '', flags.bookmarked ? 'Bookmarked' : '']
      .filter(Boolean)
      .join(' · ');
    this.command = {
      command: 'openReader.openInNowReading',
      title: 'Show in Now Reading',
      arguments: [this],
    };
  }
}

/** Greys out read chapters and badges downloaded ones, like the Explorer does for ignored files. */
export class ChapterDecorations implements vscode.FileDecorationProvider {
  provideFileDecoration(uri: vscode.Uri): vscode.FileDecoration | undefined {
    if (uri.scheme !== CHAPTER_SCHEME || !uri.query) {
      return undefined;
    }
    const flags = new Set(uri.query.split(','));
    const decoration = new vscode.FileDecoration();
    if (flags.has('read')) {
      decoration.color = new vscode.ThemeColor('disabledForeground');
    }
    if (flags.has('dl')) {
      decoration.badge = '↓';
      decoration.tooltip = 'Downloaded';
    }
    return decoration;
  }
}
