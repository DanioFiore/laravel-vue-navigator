import { describe, expect, it } from 'vitest';
import { extractEndpointAt, extractAllEndpointHits } from '../../services/axiosParser/urlExtractor';

function locate(source: string, needle: string): { line: number; character: number } {
  const index = source.indexOf(needle);
  if (index === -1) {
    throw new Error(`needle '${needle}' not found in source`);
  }
  const before = source.slice(0, index);
  const line = before.split('\n').length - 1;
  const character = index - (before.lastIndexOf('\n') + 1) + 1;
  return { line, character };
}

describe('extractEndpointAt - TypeScript', () => {
  it('detects a literal axios.get call', () => {
    const source = `import axios from 'axios';\naxios.get('/api/users');\n`;
    const { line, character } = locate(source, '/api/users');
    const result = extractEndpointAt({ languageId: 'typescript', source, line, character });
    expect(result).toEqual({ pattern: '/api/users', verb: 'GET' });
  });

  it('detects a template literal with parameter', () => {
    const source = "axios.post(`/api/users/${id}/posts`, { title: 'x' });\n";
    const { line, character } = locate(source, '/api/users');
    const result = extractEndpointAt({ languageId: 'typescript', source, line, character });
    expect(result).toEqual({ pattern: '/api/users/{param}/posts', verb: 'POST' });
  });

  it('detects a template literal with two runtime params (apiVersion + route)', () => {
    const source = [
      "let route = 'orders';",
      'const res = await axios.get(`/api/${apiVersion}/${route}`, { params: { page: 1 } });',
      ''
    ].join('\n');
    const { line, character } = locate(source, '/api/');
    const result = extractEndpointAt({ languageId: 'typescript', source, line, character });
    expect(result).toEqual({ pattern: '/api/{param}/{param}', verb: 'GET' });
  });

  it('detects axios with options object (method + url)', () => {
    const source = "axios({ method: 'patch', url: '/api/orders/42' });\n";
    const { line, character } = locate(source, '/api/orders/42');
    const result = extractEndpointAt({ languageId: 'typescript', source, line, character });
    expect(result).toEqual({ pattern: '/api/orders/42', verb: 'PATCH' });
  });

  it('detects api wrapper instance .delete', () => {
    const source = "import api from './api';\napi.delete('/api/sessions');\n";
    const { line, character } = locate(source, '/api/sessions');
    const result = extractEndpointAt({ languageId: 'typescript', source, line, character });
    expect(result).toEqual({ pattern: '/api/sessions', verb: 'DELETE' });
  });

  it('returns undefined when cursor is not inside an axios call', () => {
    const source = "const url = '/api/users';\n";
    const { line, character } = locate(source, '/api/users');
    const result = extractEndpointAt({ languageId: 'typescript', source, line, character });
    expect(result).toBeUndefined();
  });
});

describe('extractEndpointAt - Vue SFC', () => {
  it('detects axios call inside <script setup lang="ts">', () => {
    const source = `<template><div></div></template>
<script setup lang="ts">
import axios from 'axios';
const id = 1;
axios.get(\`/api/users/\${id}\`);
</script>
`;
    const { line, character } = locate(source, '/api/users');
    const result = extractEndpointAt({ languageId: 'vue', source, line, character });
    expect(result).toEqual({ pattern: '/api/users/{param}', verb: 'GET' });
  });

  it('detects axios call inside legacy <script lang="ts">', () => {
    const source = `<template></template>
<script lang="ts">
export default {
  methods: {
    load() {
      axios.put('/api/items/1', {});
    }
  }
};
</script>
`;
    const { line, character } = locate(source, '/api/items/1');
    const result = extractEndpointAt({ languageId: 'vue', source, line, character });
    expect(result).toEqual({ pattern: '/api/items/1', verb: 'PUT' });
  });
});

describe('extractAllEndpointHits', () => {
  it('lists every axios URL in a Vue SFC script block', () => {
    const source = `<template><div></div></template>
<script setup lang="ts">
import axios from 'axios';
axios.get('/api/users');
axios.post('/api/sessions', {});
</script>
`;
    const hits = extractAllEndpointHits(source, 'vue');
    expect(hits).toHaveLength(2);
    expect(hits[0].endpoint).toEqual({ pattern: '/api/users', verb: 'GET' });
    expect(hits[1].endpoint).toEqual({ pattern: '/api/sessions', verb: 'POST' });
    expect(hits[0].range.startLine).toBeGreaterThan(0);
  });
});
