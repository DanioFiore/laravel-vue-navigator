import * as vscode from 'vscode';
import { ExtensionConfig } from '../utils/config';
import { extractEndpointAt } from '../services/axiosParser/urlExtractor';
import { matchRoute } from '../services/routeMatcher';
import { locateController } from '../services/controllerLocator';
import { RouteResolver } from '../services/routeResolver';

export interface ProviderDependencies {
  readonly resolver: RouteResolver;
  readonly laravelRoot: string;
  readonly getConfig: () => ExtensionConfig;
}

export class AxiosDefinitionProvider implements vscode.DefinitionProvider {
  constructor(private readonly deps: ProviderDependencies) {}

  async provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken
  ): Promise<vscode.LocationLink[] | vscode.Location | undefined> {
    const endpoint = extractEndpointAt({
      languageId: document.languageId,
      source: document.getText(),
      line: position.line,
      character: position.character
    });

    if (!endpoint) {
      return undefined;
    }
    if (token.isCancellationRequested) {
      return undefined;
    }

    const routes = await this.deps.resolver.getRoutes();
    if (token.isCancellationRequested || routes.length === 0) {
      return undefined;
    }

    const config = this.deps.getConfig();
    const route = matchRoute(endpoint, routes, { apiBaseUrl: config.apiBaseUrl });
    if (!route) {
      return undefined;
    }
    if (!route.controller || !route.controllerMethod) {
      return undefined;
    }

    const location = locateController(route, { laravelRoot: this.deps.laravelRoot });
    if (!location) {
      return undefined;
    }

    return new vscode.Location(
      vscode.Uri.file(location.file),
      new vscode.Position(location.line, location.column)
    );
  }
}
