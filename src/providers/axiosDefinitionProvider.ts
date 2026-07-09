import * as vscode from 'vscode';
import { NavigationDependencies, provideDefinitionAt } from '../services/navigationService';

export class AxiosDefinitionProvider implements vscode.DefinitionProvider {
  constructor(private readonly getDeps: () => NavigationDependencies | undefined) {}

  provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken
  ): Promise<vscode.LocationLink[] | vscode.Location | undefined> {
    const deps = this.getDeps();
    if (!deps) {
      return Promise.resolve(undefined);
    }
    return provideDefinitionAt(deps, document, position, token);
  }
}
