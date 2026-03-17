-- 🛠️ D1 Database Schema Setup
-- Run this SQL command in your Cloudflare D1 Dashboard to create the missing 'tracks' table.

CREATE TABLE IF NOT EXISTS tracks (
    id TEXT PRIMARY KEY,
    title TEXT,
    artist TEXT,
    url TEXT,
    format TEXT,
    has_metadata INTEGER DEFAULT 0,
    durationMs INTEGER,
    durationStr TEXT,
    coverUrl TEXT
);
