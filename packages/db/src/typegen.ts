import type { Db } from './types';

interface ColumnRow {
  table_name: string;
  column_name: string;
  base_type: string;
  is_array: boolean;
  typtype: string;
  not_null: boolean;
  has_default: boolean;
  is_generated: boolean;
  is_identity: boolean;
}

const TS_PRIMITIVES: Record<string, string> = {
  uuid: 'string', text: 'string', varchar: 'string', bpchar: 'string', citext: 'string', name: 'string',
  date: 'string', timestamptz: 'string', timestamp: 'string', time: 'string', timetz: 'string', interval: 'string',
  tsvector: 'string', tsquery: 'string', inet: 'string',
  int2: 'number', int4: 'number', int8: 'number', float4: 'number', float8: 'number', numeric: 'number', oid: 'number',
  bool: 'boolean',
  json: 'Json', jsonb: 'Json',
};

function tsType(col: ColumnRow): string {
  let base: string;
  if (col.typtype === 'e') base = `Database['public']['Enums']['${col.base_type}']`;
  else base = TS_PRIMITIVES[col.base_type] ?? 'unknown';
  return col.is_array ? `${base.includes(' ') ? `(${base})` : base}[]` : base;
}

export async function generateTypes(db: Db): Promise<string> {
  const { cols, enums } = await db.withService(async (tx) => {
    const cols = await tx.query<ColumnRow>(`
      select c.relname as table_name, a.attname as column_name,
             case when t.typcategory = 'A' then et.typname else t.typname end as base_type,
             (t.typcategory = 'A') as is_array,
             case when t.typcategory = 'A' then et.typtype::text else t.typtype::text end as typtype,
             a.attnotnull as not_null, a.atthasdef as has_default,
             (a.attgenerated <> '') as is_generated, (a.attidentity <> '') as is_identity
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
        join pg_type t on t.oid = a.atttypid
        left join pg_type et on et.oid = t.typelem and t.typcategory = 'A'
       where n.nspname = 'public' and c.relkind = 'r'
       order by c.relname, a.attnum`);
    const enums = await tx.query<{ name: string; labels: string[] }>(`
      select t.typname as name, array_agg(e.enumlabel order by e.enumsortorder) as labels
        from pg_type t
        join pg_enum e on e.enumtypid = t.oid
        join pg_namespace n on n.oid = t.typnamespace
       where n.nspname = 'public'
       group by t.typname
       order by t.typname`);
    return { cols: cols.rows, enums: enums.rows };
  });

  const tables = new Map<string, ColumnRow[]>();
  for (const c of cols) {
    const list = tables.get(c.table_name) ?? [];
    list.push(c);
    tables.set(c.table_name, list);
  }

  const out: string[] = [];
  out.push('// GENERATED FILE - do not edit. Run `npm run gen:types -w @projectx/db` (introspects migrated PGlite).');
  out.push('// Shape follows Supabase generated types. Notes: numeric/bigint are typed `number` and timestamps/dates `string`');
  out.push('// as in Supabase; at runtime our drivers return int8/numeric as strings and timestamptz as Date unless cast in SQL.');
  out.push('');
  out.push('export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];');
  out.push('');
  out.push('export type Database = {');
  out.push('  public: {');
  out.push('    Tables: {');
  for (const [table, list] of tables) {
    const row = list.map((c) => `          ${c.column_name}: ${tsType(c)}${c.not_null ? '' : ' | null'}`);
    const insert = list
      .filter((c) => !c.is_generated)
      .map((c) => {
        const optional = !c.not_null || c.has_default || c.is_identity;
        return `          ${c.column_name}${optional ? '?' : ''}: ${tsType(c)}${c.not_null ? '' : ' | null'}`;
      });
    const update = list
      .filter((c) => !c.is_generated)
      .map((c) => `          ${c.column_name}?: ${tsType(c)}${c.not_null ? '' : ' | null'}`);
    out.push(`      ${table}: {`);
    out.push('        Row: {', ...row, '        };');
    out.push('        Insert: {', ...insert, '        };');
    out.push('        Update: {', ...update, '        };');
    out.push('        Relationships: [];');
    out.push('      };');
  }
  out.push('    };');
  out.push('    Views: { [_ in never]: never };');
  out.push('    Functions: { [_ in never]: never };');
  out.push('    Enums: {');
  for (const e of enums) {
    out.push(`      ${e.name}: ${e.labels.map((l) => `'${l}'`).join(' | ')};`);
  }
  out.push('    };');
  out.push('    CompositeTypes: { [_ in never]: never };');
  out.push('  };');
  out.push('};');
  out.push('');
  out.push('export const enumValues = {');
  for (const e of enums) {
    out.push(`  ${e.name}: [${e.labels.map((l) => `'${l}'`).join(', ')}],`);
  }
  out.push('} as const;');
  out.push('');
  return out.join('\n');
}

