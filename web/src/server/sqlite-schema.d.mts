// Declarations for the dependency-free SQLite schema module.
import type {DatabaseSync} from 'node:sqlite';
export declare const SCHEMA_VERSION: number;
export declare const SCHEMA_SQL: string;
export declare function initializeSchema(db: DatabaseSync): void;
