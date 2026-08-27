import * as vscode from 'vscode';
import type { Library } from '../epub/library';
import { parseTocQuery } from './uris';

export class TocContentProvider implements vscode.TextDocumentContentProvider {
  private readonly _onDidChange = new vscode.EventEmitter<vscode.Uri>();
  readonly onDidChange = this._onDidChange.event;

  constructor(private library: Library) {}

  async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
    const { filePath } = parseTocQuery(uri);
    const meta = await this.library.getMeta(filePath);

    const lines = [`# ${meta.title}`];
    if (meta.creator) {lines.push('', `*by ${meta.creator}*`);}
    lines.push('', `${meta.totalChapters} chapters`, '');

    meta.toc.forEach((item, index) => {
      lines.push(`${index + 1}. ${item.label}`);
    });

    lines.push('', '---', '', 'Open a chapter from the Library view in the sidebar to start reading.');

    return lines.join('\n');
  }
}
