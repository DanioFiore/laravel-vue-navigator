export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS' | 'HEAD' | 'ANY';

export interface LaravelRoute {
  readonly methods: HttpMethod[];
  readonly uri: string;
  readonly name?: string;
  readonly action: string;
  readonly controller?: string;
  readonly controllerMethod?: string;
  readonly middleware?: string[];
}

export interface ResolvedLocation {
  readonly file: string;
  readonly line: number;
  readonly column: number;
}

export interface RouteWithLocation extends LaravelRoute {
  readonly location?: ResolvedLocation;
}

export interface ExtractedEndpoint {
  readonly pattern: string;
  readonly verb: HttpMethod | undefined;
}

export interface RouteCachePayload {
  readonly version: 1;
  readonly generatedAt: number;
  readonly source: 'artisan' | 'static';
  readonly routes: LaravelRoute[];
}
