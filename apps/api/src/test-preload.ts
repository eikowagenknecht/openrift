// Set a dummy DATABASE_URL so db.ts doesn't throw during module evaluation.
// Bun's mock.module doesn't prevent transitive module loading, so db.ts may
// be evaluated even when tests mock "./db.js".
process.env.DATABASE_URL ??= "postgres://test:test@localhost/test";
