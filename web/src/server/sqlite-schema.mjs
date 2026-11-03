// SQLite schema for Build Desk v2. A new database starts at schema version 1.
// This module intentionally has no runtime or Excel dependencies.
export const SCHEMA_VERSION = 1;
export const SCHEMA_SQL = `
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY, description TEXT NOT NULL, applied_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS builds (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, active INTEGER NOT NULL CHECK(active IN (0,1)),
  printer_id TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS build_revisions (
  build_id TEXT PRIMARY KEY REFERENCES builds(id) ON DELETE RESTRICT,
  revision INTEGER NOT NULL DEFAULT 0 CHECK(revision >= 0), updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS print_parts (
  build_id TEXT NOT NULL, id TEXT NOT NULL, name TEXT NOT NULL,
  section TEXT NOT NULL, source TEXT NOT NULL, material TEXT NOT NULL,
  required_qty INTEGER CHECK(required_qty IS NULL OR (typeof(required_qty)='integer' AND required_qty >= 0)),
  opening_qty INTEGER NOT NULL CHECK(typeof(opening_qty)='integer' AND opening_qty >= 0),
  installed_qty INTEGER NOT NULL CHECK(typeof(installed_qty)='integer' AND installed_qty >= 0),
  notes TEXT NOT NULL DEFAULT '',
  PRIMARY KEY(build_id,id), FOREIGN KEY(build_id) REFERENCES builds(id) ON DELETE RESTRICT
);
CREATE TABLE IF NOT EXISTS model_files (
  build_id TEXT NOT NULL, id TEXT NOT NULL, filename TEXT NOT NULL,
  revision_label TEXT NOT NULL, profile TEXT NOT NULL, material TEXT NOT NULL,
  section TEXT NOT NULL, source_hash TEXT, imported_at TEXT,
  PRIMARY KEY(build_id,id), FOREIGN KEY(build_id) REFERENCES builds(id) ON DELETE RESTRICT
);
CREATE TABLE IF NOT EXISTS plates (
  build_id TEXT NOT NULL, id TEXT NOT NULL, file_id TEXT NOT NULL,
  plate_number INTEGER NOT NULL CHECK(plate_number > 0),
  name TEXT NOT NULL, section TEXT NOT NULL, unmapped_json TEXT NOT NULL DEFAULT '[]',
  PRIMARY KEY(build_id,id), UNIQUE(build_id,file_id,plate_number),
  FOREIGN KEY(build_id,file_id) REFERENCES model_files(build_id,id) ON DELETE RESTRICT
);
CREATE TABLE IF NOT EXISTS plate_assignments (
  build_id TEXT NOT NULL, id TEXT NOT NULL, plate_id TEXT NOT NULL,
  part_id TEXT NOT NULL, copies INTEGER CHECK(copies IS NULL OR (typeof(copies)='integer' AND copies >= 0)),
  confirmed INTEGER NOT NULL CHECK(confirmed IN (0,1)), note TEXT NOT NULL DEFAULT '',
  PRIMARY KEY(build_id,id), UNIQUE(build_id,plate_id,part_id),
  FOREIGN KEY(build_id,plate_id) REFERENCES plates(build_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(build_id,part_id) REFERENCES print_parts(build_id,id) ON DELETE RESTRICT
);
CREATE TABLE IF NOT EXISTS plate_preparations (
  build_id TEXT NOT NULL, plate_id TEXT NOT NULL,
  runs INTEGER NOT NULL CHECK(runs BETWEEN 1 AND 100),
  material TEXT NOT NULL, profile TEXT NOT NULL,
  source_hash TEXT NOT NULL, notes TEXT NOT NULL DEFAULT '', saved_at TEXT NOT NULL,
  PRIMARY KEY(build_id,plate_id),
  FOREIGN KEY(build_id,plate_id) REFERENCES plates(build_id,id) ON DELETE RESTRICT
);
CREATE TABLE IF NOT EXISTS preparation_items (
  build_id TEXT NOT NULL, plate_id TEXT NOT NULL, mapping_id TEXT NOT NULL,
  included INTEGER NOT NULL CHECK(included IN (0,1)),
  copies INTEGER CHECK(copies IS NULL OR (typeof(copies)='integer' AND copies >= 0)),
  planned_qty INTEGER CHECK(planned_qty IS NULL OR (typeof(planned_qty)='integer' AND planned_qty >= 0)),
  PRIMARY KEY(build_id,plate_id,mapping_id),
  FOREIGN KEY(build_id,plate_id) REFERENCES plate_preparations(build_id,plate_id) ON DELETE RESTRICT,
  FOREIGN KEY(build_id,mapping_id) REFERENCES plate_assignments(build_id,id) ON DELETE RESTRICT
);
CREATE TABLE IF NOT EXISTS print_jobs (
  build_id TEXT NOT NULL, id TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('plate','manual')),
  status TEXT NOT NULL CHECK(status IN ('Printing','Awaiting inspection','Completed','Cancelled')),
  started_at TEXT NOT NULL, finished_at TEXT,
  PRIMARY KEY(build_id,id), FOREIGN KEY(build_id) REFERENCES builds(id) ON DELETE RESTRICT
);
CREATE TABLE IF NOT EXISTS print_job_items (
  build_id TEXT NOT NULL, job_id TEXT NOT NULL, line_no INTEGER NOT NULL CHECK(line_no >= 0),
  part_id TEXT NOT NULL, mapping_id TEXT NOT NULL,
  file_id TEXT NOT NULL, file_revision TEXT NOT NULL, filename TEXT NOT NULL,
  plate_number INTEGER NOT NULL, plate_name TEXT NOT NULL,
  runs INTEGER NOT NULL CHECK(runs >= 0), planned_qty INTEGER NOT NULL CHECK(typeof(planned_qty)='integer' AND planned_qty >= 0),
  accepted_qty INTEGER CHECK(accepted_qty IS NULL OR (typeof(accepted_qty)='integer' AND accepted_qty >= 0)),
  rejected_qty INTEGER CHECK(rejected_qty IS NULL OR (typeof(rejected_qty)='integer' AND rejected_qty >= 0)),
  profile TEXT NOT NULL, material TEXT NOT NULL, notes TEXT NOT NULL,
  PRIMARY KEY(build_id,job_id,line_no),
  FOREIGN KEY(build_id,job_id) REFERENCES print_jobs(build_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(build_id,part_id) REFERENCES print_parts(build_id,id) ON DELETE RESTRICT
);
CREATE TABLE IF NOT EXISTS inspection_drafts (
  build_id TEXT NOT NULL, job_id TEXT NOT NULL, mapping_id TEXT NOT NULL,
  accepted_qty INTEGER CHECK(accepted_qty IS NULL OR (typeof(accepted_qty)='integer' AND accepted_qty >= 0)),
  rejected_qty INTEGER CHECK(rejected_qty IS NULL OR (typeof(rejected_qty)='integer' AND rejected_qty >= 0)),
  PRIMARY KEY(build_id,job_id,mapping_id),
  FOREIGN KEY(build_id,job_id) REFERENCES print_jobs(build_id,id) ON DELETE RESTRICT
);
CREATE TABLE IF NOT EXISTS vendors (
  id INTEGER PRIMARY KEY, display_name TEXT NOT NULL, normalized_name TEXT NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS purchase_parts (
  build_id TEXT NOT NULL, id TEXT NOT NULL, category TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL, specification TEXT NOT NULL DEFAULT '',
  designer_requirement TEXT NOT NULL DEFAULT '',
  required_qty INTEGER CHECK(required_qty IS NULL OR (typeof(required_qty)='integer' AND required_qty >= 0)),
  on_hand_qty INTEGER CHECK(on_hand_qty IS NULL OR (typeof(on_hand_qty)='integer' AND on_hand_qty >= 0)),
  ordered INTEGER NOT NULL DEFAULT 0 CHECK(ordered IN (0,1)),
  vendor_id INTEGER, product_url TEXT NOT NULL DEFAULT '',
  ordered_date TEXT, notes TEXT NOT NULL DEFAULT '',
  PRIMARY KEY(build_id,id),
  FOREIGN KEY(build_id) REFERENCES builds(id) ON DELETE RESTRICT,
  FOREIGN KEY(vendor_id) REFERENCES vendors(id) ON DELETE RESTRICT,
  CHECK(length(notes) <= 200)
);
CREATE TABLE IF NOT EXISTS write_requests (
  build_id TEXT NOT NULL, request_id TEXT NOT NULL, command_type TEXT NOT NULL,
  summary TEXT NOT NULL, committed_at TEXT NOT NULL, revision INTEGER NOT NULL,
  PRIMARY KEY(build_id,request_id), FOREIGN KEY(build_id) REFERENCES builds(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_plate_assignments_part ON plate_assignments(build_id,part_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON print_jobs(build_id,status);
CREATE INDEX IF NOT EXISTS idx_job_items_part ON print_job_items(build_id,part_id);
CREATE INDEX IF NOT EXISTS idx_purchase_ordered ON purchase_parts(build_id,ordered);
CREATE INDEX IF NOT EXISTS idx_purchase_vendor ON purchase_parts(vendor_id);
`;
export function initializeSchema(db) {
  db.exec('PRAGMA foreign_keys=ON');
  db.exec(SCHEMA_SQL);
  const found = db.prepare('SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1').get();
  if (found && found.version !== SCHEMA_VERSION) throw Error('Unsupported SQLite schema version '+found.version);
  if (!found) db.prepare('INSERT INTO schema_migrations(version,description,applied_at) VALUES(?,?,?)')
    .run(SCHEMA_VERSION,'Initial normalized Build Desk schema',new Date().toISOString());
  if (db.prepare('PRAGMA foreign_key_check').all().length) throw Error('SQLite foreign key validation failed');
}
