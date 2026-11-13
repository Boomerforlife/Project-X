import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from '../src/config.js';

describe('loadConfig', () => {
  it('defaults to mock, pglite and the documented budget caps', () => {
    const { config, warnings } = loadConfig({});
    expect(config).toMatchObject({ provider: 'mock', dbDriver: 'pglite', dailyBudgetUsd: 1, maxCallsPerRun: 200, sympyTimeoutMs: 5000 });
    expect(config.models).toEqual({ FAST: 'gemini-3.5-flash-lite', STRONG: 'gemini-3.8-flash' });
    expect(warnings).toEqual([]);
  });

  it('AI_PROVIDER=gemini without a key falls back to mock with a warning', () => {
    const { config, warnings } = loadConfig({ AI_PROVIDER: 'gemini', GEMINI_API_KEY: '' });
    expect(config.provider).toBe('mock');
    expect(warnings.join(' ')).toMatch(/falling back to the mock/);
  });

  it('keeps gemini when a key is present', () => {
    expect(loadConfig({ AI_PROVIDER: 'gemini', GEMINI_API_KEY: 'k' }).config.provider).toBe('gemini');
  });

  it('refuses to start with the mock provider in production', () => {
    expect(() => loadConfig({ APP_ENV: 'production', AI_PROVIDER: 'mock' })).toThrow(ConfigError);
    expect(() => loadConfig({ APP_ENV: 'production', AI_PROVIDER: 'gemini' })).toThrow(/mock AI provider/);
    expect(() => loadConfig({ APP_ENV: 'production', AI_PROVIDER: 'gemini', GEMINI_API_KEY: 'k' })).not.toThrow();
  });

  it('CLI overrides win; invalid values are config errors', () => {
    expect(loadConfig({ AI_PROVIDER: 'gemini', GEMINI_API_KEY: 'k' }, { provider: 'mock' }).config.provider).toBe('mock');
    expect(() => loadConfig({}, { provider: 'openai' })).toThrow(ConfigError);
    expect(() => loadConfig({}, { db: 'postgres' })).toThrow(/DATABASE_URL/);
    expect(() => loadConfig({ AI_DAILY_BUDGET_USD: 'abc' })).toThrow(ConfigError);
  });
});
