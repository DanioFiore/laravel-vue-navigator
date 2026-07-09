import { describe, expect, it } from 'vitest';
import { parseRoutesFromFiles } from '../../services/routeResolver/staticParser';
import { detectApiRoutePrefix } from '../../utils/apiPrefixDetector';
import { matchRoute } from '../../services/routeMatcher';
import { extractEndpointAt } from '../../services/axiosParser/urlExtractor';

const INVENTORY_ROOT = '/Users/daniofiore/Desktop/wa/inventory-project';

describe('inventory-project integration', () => {
  it('matches a route that exists before merge-conflict truncation in api_v1.php', () => {
    const prefix = detectApiRoutePrefix(INVENTORY_ROOT);
    const routes = parseRoutesFromFiles({ laravelRoot: INVENTORY_ROOT, apiRoutePrefix: prefix });
    const match = matchRoute(
      { pattern: '/api/{param}/users/settings', verb: 'GET' },
      routes,
      { apiBaseUrl: '/api' }
    );
    expect(match?.uri).toBe('/api/v1/users/settings');
  });

  it('extracts endpoint from inventory-style axios call', () => {
    const source = `const apiVersion = 'v1';
    const res = await axios.get(\`/api/\${apiVersion}/products\`, { params: {} });`;
    const pos = source.indexOf('/api');
    const endpoint = extractEndpointAt({
      languageId: 'javascript',
      source,
      line: source.slice(0, pos).split('\n').length - 1,
      character: pos - source.lastIndexOf('\n', pos - 1) - 1
    });
    expect(endpoint).toEqual({ pattern: '/api/{param}/products', verb: 'GET' });
  });
});
