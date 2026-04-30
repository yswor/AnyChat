PRAGMA foreign_keys = OFF;

CREATE TABLE conversations_new (
    id TEXT PRIMARY KEY,
    title TEXT,
    provider_id TEXT,
    model TEXT NOT NULL,
    temperature REAL NOT NULL DEFAULT 0.7,
    max_tokens INTEGER NOT NULL DEFAULT 0,
    top_p REAL NOT NULL DEFAULT 1.0,
    frequency_penalty REAL NOT NULL DEFAULT 0.0,
    presence_penalty REAL NOT NULL DEFAULT 0.0,
    system_prompt TEXT NOT NULL DEFAULT '',
    thinking_enabled INTEGER NOT NULL DEFAULT 0,
    reasoning_effort TEXT NOT NULL DEFAULT 'high',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE SET NULL
);

INSERT INTO conversations_new (
    id, title, provider_id, model, temperature, max_tokens, top_p,
    system_prompt, thinking_enabled, reasoning_effort,
    created_at, updated_at, frequency_penalty, presence_penalty
)
SELECT
    id, title, provider_id, model, temperature, max_tokens, top_p,
    system_prompt, thinking_enabled, reasoning_effort,
    created_at, updated_at, frequency_penalty, presence_penalty
FROM conversations;

DROP TABLE conversations;

ALTER TABLE conversations_new RENAME TO conversations;

PRAGMA foreign_keys = ON;
