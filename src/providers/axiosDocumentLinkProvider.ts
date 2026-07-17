import * as vscode from 'vscode';
import { extractAllEndpointHits } from '../services/axiosParser/urlExtractor';
import { getConfig } from '../utils/config';

export interface GoToControllerArgs {
  readonly uri: string;
  readonly line: number;
  readonly character: number;
}

export class AxiosDocumentLinkProvider implements vscode.DocumentLinkProvider {
  provideDocumentLinks(
    document: vscode.TextDocument,
    _token: vscode.CancellationToken
  ): vscode.DocumentLink[] {
    if (!getConfig().underlineUrls) {
      return [];
    }

    const hits = extractAllEndpointHits(document.getText(), document.languageId);
    return hits.map(hit => {
      const range = new vscode.Range(
        new vscode.Position(hit.range.startLine, hit.range.startCharacter),
        new vscode.Position(hit.range.endLine, hit.range.endCharacter)
      );
      const link = new vscode.DocumentLink(range);
      const verb = hit.endpoint.verb ? `${hit.endpoint.verb} ` : '';
      link.tooltip = `Go to Laravel controller — ${verb}${hit.endpoint.pattern}`;
      link.target = goToControllerCommandUri({
        uri: document.uri.toString(),
        line: hit.range.startLine,
        character: hit.range.startCharacter
      });
      return link;
    });
  }
}

export function goToControllerCommandUri(args: GoToControllerArgs): vscode.Uri {
  return vscode.Uri.parse(
    `command:laravelVueNavigator.goToController?${encodeURIComponent(JSON.stringify([args]))}`
  );
}
