import * as crypto from 'crypto';
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

const bookKeys = new Map<string, string>();

/** A short, stable id for a book path, computed once per book rather than per chapter. */
function bookKey(filePath: string): string {
  let key = bookKeys.get(filePath);
  if (!key) {
    key = crypto.createHash('sha1').update(filePath).digest('hex').slice(0, 12);
    bookKeys.set(filePath, key);
  }
  return key;
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
    // Read state is shown by fading alone (see ChapterDecorations); a blank icon keeps
    // the labels aligned without any marker.
    this.iconPath = new vscode.ThemeIcon('blank');
    this.description = flags.current ? 'reading' : undefined;
    // The URI carries the flags so ChapterDecorations can dim read chapters statelessly.
    // Every chapter carries a colour: unread (and the one being read) at full strength,
    // read at 25%. Unread needs its own colour too, since some themes grey the whole sidebar.
    const state = [flags.read && !flags.current ? 'read' : 'unread', flags.downloaded ? 'dl' : ''].filter(Boolean).join(',');
    // One address per book and chapter, so a decoration is never shared between books.
    const book = bookKey(filePath);
    this.resourceUri = vscode.Uri.from({ scheme: CHAPTER_SCHEME, path: `/${book}/${index}`, query: state });
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

/** Full-strength unread chapters, faded read ones, and a ↓ badge on downloaded ones. */
export class ChapterDecorations implements vscode.FileDecorationProvider {
  provideFileDecoration(uri: vscode.Uri): vscode.FileDecoration | undefined {
    if (uri.scheme !== CHAPTER_SCHEME || !uri.query) {
      return undefined;
    }
    const flags = new Set(uri.query.split(','));
    const decoration = new vscode.FileDecoration();
    decoration.color = new vscode.ThemeColor(
      flags.has('read') ? 'openReader.readChapterForeground' : 'openReader.unreadChapterForeground'
    );
    if (flags.has('dl')) {
      decoration.badge = '↓';
      decoration.tooltip = 'Downloaded';
    }
    return decoration;
  }
}
