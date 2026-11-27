// Loaded by "npm test" (node --import) before each test file.
// It turns on test mode for the whole run, so a test file that does not
// import test/helpers/db.ts still can not use the real DATABASE_URL.
process.env.OPEN_BRAIN_TEST = "1";
