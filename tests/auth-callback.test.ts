import { describe, expect, it } from 'vitest';
import { extractAuthCode, extractAuthError } from '../src/state/auth';

describe('Nanime OAuth callback URL handling', () => {
  it('extracts a code from the native nanime callback', () => {
    expect(extractAuthCode('nanime://auth-callback?code=native-code')).toBe('native-code');
  });

  it('extracts a code from the web hash callback', () => {
    expect(extractAuthCode('https://nanime.example/#/auth/callback?code=web-code')).toBe('web-code');
  });

  it('preserves provider errors without treating them as an auth code', () => {
    const url = 'nanime://auth-callback?error=access_denied&error_description=User%20cancelled';
    expect(extractAuthCode(url)).toBeNull();
    expect(extractAuthError(url)).toBe('User cancelled');
  });
});
