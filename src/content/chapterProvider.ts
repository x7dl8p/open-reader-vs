import * as vscode from 'vscode';
import TurndownService from 'turndown';
import type { Library } from '../epub/library';
import { parseChapterQuery } from './uris';

const turndown = new TurndownService({ headingStyle: 'atx', bulletListMarker: '-', codeBlockStyle: 'fenced' });

export class ChapterContentProvider implements vscode.TextDocumentContentProvider {
  private readonly _onDidChange = new vscode.EventEmitter<vscode.Uri>();
  readonly onDidChange = this._onDidChange.event;

  constructor(private library: Library) {}

  async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
    const { filePath, index } = parseChapterQuery(uri);
    const [meta, chapter] = await Promise.all([this.library.getMeta(filePath), this.library.getChapter(filePath, index)]);

    const markdown = turndown.turndown(chapter.html || '<p><em>(empty chapter)</em></p>');
    const total = meta.totalChapters;

    return [`# ${chapter.title}`, '', `*${meta.title} — chapter ${index + 1} of ${total}*`, '', markdown].join('\n');
  }
}
