import * as vscode from 'vscode';

export class ChapterItem extends vscode.TreeItem {
  constructor(public readonly filePath: string, public readonly index: number, label: string, isCurrent: boolean) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.id = `${filePath}::${index}`;
    this.contextValue = 'chapter';
    this.iconPath = new vscode.ThemeIcon(isCurrent ? 'debug-stackframe-dot' : 'circle-small');
    this.description = isCurrent ? 'reading' : undefined;
    this.command = {
      command: 'openReader.openInNowReading',
      title: 'Show in Now Reading',
      arguments: [this],
    };
  }
}
