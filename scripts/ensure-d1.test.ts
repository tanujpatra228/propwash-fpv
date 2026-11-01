import { describe, expect, it } from 'vitest';
// @ts-expect-error plain JavaScript module without types
import { findDatabaseId, injectDatabaseId } from './ensure-d1.mjs';

const config = `{
  "name": "propwash-fpv",
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "propwash-fpv",
      "migrations_dir": "migrations"
    }
  ]
}
`;

describe('ensure-d1 helpers', () => {
  it('adds the database id right after the name, and the result is still valid once comments are absent', () => {
    const out = injectDatabaseId(config, 'propwash-fpv', 'abc-123') as string;
    expect(out).toContain('"database_name": "propwash-fpv",\n      "database_id": "abc-123",');
    expect(JSON.parse(out).d1_databases[0].database_id).toBe('abc-123');
    expect(JSON.parse(out).d1_databases[0].migrations_dir).toBe('migrations');
  });

  it('replaces an id that is already there instead of duplicating it', () => {
    const once = injectDatabaseId(config, 'propwash-fpv', 'old-id') as string;
    const twice = injectDatabaseId(once, 'propwash-fpv', 'new-id') as string;
    expect(twice.match(/database_id/g)).toHaveLength(1);
    expect(JSON.parse(twice).d1_databases[0].database_id).toBe('new-id');
  });

  it('refuses a config without the database entry', () => {
    expect(() => injectDatabaseId('{ "name": "x" }', 'propwash-fpv', 'abc')).toThrow(/No d1_databases entry/);
  });

  it('finds a database by exact name in wrangler\'s list output', () => {
    const list = JSON.stringify([{ uuid: 'one', name: 'other' }, { uuid: 'two', name: 'propwash-fpv' }]);
    expect(findDatabaseId(list, 'propwash-fpv')).toBe('two');
    expect(findDatabaseId(list, 'missing')).toBeNull();
    expect(findDatabaseId('[]', 'propwash-fpv')).toBeNull();
  });
});
