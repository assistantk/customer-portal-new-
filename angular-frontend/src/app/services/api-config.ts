import { environment } from '../../environments/environment';

export const API_BASE_URL = environment.apiBaseUrl;

export function isSecureApiTransport(pageUrl: string, apiBaseUrl: string): boolean {
  try {
    const page = new URL(pageUrl);
    const api = new URL(apiBaseUrl, page);
    return page.protocol === 'https:' && api.protocol === 'https:';
  } catch {
    return false;
  }
}