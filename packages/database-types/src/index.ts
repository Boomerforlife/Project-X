import type { Database } from './database';

export type { Database, Json } from './database';
export { enumValues } from './database';

export type PublicSchema = Database['public'];
export type TableName = keyof PublicSchema['Tables'];
export type Tables<T extends TableName> = PublicSchema['Tables'][T]['Row'];
export type TablesInsert<T extends TableName> = PublicSchema['Tables'][T]['Insert'];
export type TablesUpdate<T extends TableName> = PublicSchema['Tables'][T]['Update'];
export type EnumName = keyof PublicSchema['Enums'];
export type Enums<T extends EnumName> = PublicSchema['Enums'][T];
