ALTER TABLE conversations ADD COLUMN frequency_penalty REAL NOT NULL DEFAULT 0.0;
ALTER TABLE conversations ADD COLUMN presence_penalty REAL NOT NULL DEFAULT 0.0;
