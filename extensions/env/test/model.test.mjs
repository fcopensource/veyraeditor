import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const m = createRequire(import.meta.url)("../out/model.js");

test("reads .env files the way dotenv does", () => {
  const text = [
    "# Database",
    "DATABASE_URL=postgres://app:s3cret@localhost:5432/shop",
    "export PORT=3000",
    "NAME='My Shop'",
    'GREETING="Hello\\nWorld"',
    "EMPTY=",
    "INLINE=value # a comment",
    "HASH=abc#def",
    'PRIVATE_KEY="-----BEGIN PRIVATE KEY-----',
    "MIIEvQIBADANBg",
    '-----END PRIVATE KEY-----"',
    "AFTER=1",
    "",
  ].join("\n");
  const { entries, problems } = m.parseEnv(text);
  const get = k => entries.find(e => e.key === k);
  assert.deepEqual(entries.map(e => e.key), ["DATABASE_URL", "PORT", "NAME", "GREETING", "EMPTY", "INLINE", "HASH", "PRIVATE_KEY", "AFTER"]);
  assert.equal(get("PORT").exported, true);
  assert.equal(get("NAME").value, "My Shop");
  assert.equal(get("GREETING").value, "Hello\nWorld");
  assert.equal(get("EMPTY").value, "");
  assert.equal(get("INLINE").value, "value");
  assert.equal(get("HASH").value, "abc#def", "a # without a space before it is part of the value");
  assert.equal(get("PRIVATE_KEY").value, "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBg\n-----END PRIVATE KEY-----");
  assert.deepEqual([get("PRIVATE_KEY").line, get("PRIVATE_KEY").endLine], [8, 10]);
  assert.equal(get("AFTER").line, 11);
  const url = get("DATABASE_URL");
  assert.equal(text.split("\n")[1].slice(url.valueStart, url.valueEnd), "postgres://app:s3cret@localhost:5432/shop");
  assert.equal(text.split("\n")[3].slice(get("NAME").valueStart, get("NAME").valueEnd), "'My Shop'");
  assert.deepEqual(problems, []);
});

test("finds mistakes in .env files, with fixes", () => {
  const text = ["API_KEY = abc", "API_KEY=second", "just some words", "1BAD=x", "TITLE=Hello there", "OPEN='never closed", "=nokey", 'Q="ok" trailing'].join("\n");
  const { problems } = m.parseEnv(text);
  const byCode = c => problems.find(p => p.code === c);
  assert.deepEqual(problems.map(p => p.code).sort(), ["after-quote", "bad-key", "duplicate", "no-equals", "no-key", "spaces", "unclosed", "unquoted-space"].sort());
  assert.equal(byCode("spaces").fix.text, "API_KEY=abc");
  assert.equal(byCode("duplicate").line, 1);
  assert.match(byCode("duplicate").message, /line 1/);
  assert.equal(byCode("unquoted-space").fix.text, 'TITLE="Hello there"');
  assert.equal(byCode("no-equals").severity, "error");
});

test("an unclosed double quote is reported, not silently eating the file", () => {
  const { entries, problems } = m.parseEnv('A="open\nB=2\nC=3');
  assert.equal(problems[0].code, "unclosed");
  assert.deepEqual(entries.map(e => e.key), ["A", "B", "C"], "later keys are still read");
});

test("formats lines, quoting only when needed", () => {
  assert.equal(m.formatLine("A", "simple-value_1.2/x"), "A=simple-value_1.2/x");
  assert.equal(m.formatLine("A", "has space"), "A='has space'");
  assert.equal(m.formatLine("A", "it's"), 'A="it\'s"');
  assert.equal(m.formatLine("A", "two\nlines"), 'A="two\\nlines"');
  assert.equal(m.formatLine("A", ""), "A=");
  for (const value of ["x y", "it's \"quoted\"", "a\nb", "#hash", "simple"]) {
    const { entries } = m.parseEnv(m.formatLine("K", value));
    assert.equal(entries[0].value, value, `round trip ${JSON.stringify(value)}`);
  }
});

test("env file names", () => {
  for (const f of [".env", ".env.local", ".env.production.local", "production.env", ".env.example"]) assert.ok(m.isEnvFile(f), f);
  for (const f of [".envrc", "env.ts", ".environment", "environment.yml"]) assert.ok(!m.isEnvFile(f), f);
  for (const f of [".env.example", ".env.sample", ".env.template", "example.env", ".env.dist"]) assert.ok(m.isTemplate(f), f);
  for (const f of [".env", ".env.local", ".env.production"]) assert.ok(!m.isTemplate(f), f);
  assert.ok(m.appliesTo("C:\\work\\shop", "c:/work/shop/src/app.ts"));
  assert.ok(!m.appliesTo("C:\\work\\shop\\api", "C:\\work\\shop\\web\\app.ts"));
});

test("spots secrets by name and by value", () => {
  for (const [k, v] of [["STRIPE_SECRET_KEY", "sk_live_51Habc123def456"], ["API_KEY", "abc123"], ["DB_PASSWORD", "hunter2"], ["GITHUB", "ghp_abcdefghijklmnopqrstuvwxyz0123"], ["DATABASE_URL", "postgres://app:s3cret@db:5432/x"], ["JWT", "eyJhbGciOi.eyJzdWIiOi.SflKxwRJ"], ["OPENAI", "sk-proj-abcdefghijklmnopqrstuv"], ["NEXTAUTH_SECRET", "x9"]])
    assert.ok(m.isSecret(k, v), `${k} is secret`);
  for (const [k, v] of [["PORT", "3000"], ["NODE_ENV", "production"], ["DATABASE_URL", "postgres://localhost:5432/x"], ["NEXT_PUBLIC_API_URL", "https://api.example.com"], ["TOKEN", ""], ["DEBUG", "true"], ["NEXT_PUBLIC_KEY", "pk_test_123"]])
    assert.ok(!m.isSecret(k, v), `${k}=${v} is not secret`);
  assert.equal(m.mask("sk_live_51Habc123def456"), "sk_l••••••••••••");
  assert.equal(m.mask("abc"), "••••••");
});

test("finds env variables in code, in many languages", () => {
  const names = (line, lang) => m.findUsages(line, lang).map(u => u.name);
  assert.deepEqual(names(`const url = process.env.DATABASE_URL ?? process.env["REDIS_URL"];`, "typescript"), ["DATABASE_URL", "REDIS_URL"]);
  assert.deepEqual(names("fetch(import.meta.env.VITE_API_URL)", "vue"), ["VITE_API_URL"]);
  assert.deepEqual(names("Deno.env.get('KEY'); Bun.env.OTHER", "typescript"), ["KEY", "OTHER"]);
  assert.deepEqual(names(`key = os.environ["STRIPE_KEY"]; d = os.getenv('DEBUG_SQL'); os.environ.get("X")`, "python"), ["STRIPE_KEY", "DEBUG_SQL", "X"]);
  assert.deepEqual(names(`port := os.Getenv("PORT")`, "go"), ["PORT"]);
  assert.deepEqual(names(`ENV["SECRET"] || ENV.fetch('OTHER')`, "ruby"), ["SECRET", "OTHER"]);
  assert.deepEqual(names(`$k = getenv('APP_KEY'); $_ENV["DB"]; env('MAIL_HOST')`, "php"), ["APP_KEY", "DB", "MAIL_HOST"]);
  assert.deepEqual(names(`let k = env::var("API_KEY")?;`, "rust"), ["API_KEY"]);
  assert.deepEqual(names(`System.getenv("HOME_DIR")`, "java"), ["HOME_DIR"]);
  assert.deepEqual(names(`Environment.GetEnvironmentVariable("CONN")`, "csharp"), ["CONN"]);
  assert.deepEqual(names("// process.env.IN_A_COMMENT", "typescript"), []);
  assert.deepEqual(names("process.env.X", "python"), [], "only the language's own syntax");
  const [u] = m.findUsages(`  const k = process.env["API_KEY"]`, "javascript");
  assert.equal(`  const k = process.env["API_KEY"]`.slice(u.start, u.end), "API_KEY");
});

test("knows where to offer completions", () => {
  assert.deepEqual(m.completionContext("const a = process.env.DA", "typescript"), { prefix: "DA", quoted: false });
  assert.deepEqual(m.completionContext("const a = process.env.", "typescript"), { prefix: "", quoted: false });
  assert.deepEqual(m.completionContext('x = os.getenv("ST', "python"), { prefix: "ST", quoted: true });
  assert.deepEqual(m.completionContext("import.meta.env.V", "svelte"), { prefix: "V", quoted: false });
  assert.equal(m.completionContext("const env = process.envi", "typescript"), undefined);
  assert.equal(m.completionContext('os.getenv("A")', "python"), undefined, "not after the closing quote");
});

test("built-in variables are never reported as missing", () => {
  for (const n of ["NODE_ENV", "PATH", "CI", "GITHUB_SHA", "npm_package_version", "MODE", "VERCEL_ENV"]) assert.ok(m.isBuiltIn(n), n);
  assert.ok(!m.isBuiltIn("DATABASE_URL"));
  assert.ok(m.isBuiltIn("MY_PLATFORM_VAR", ["MY_PLATFORM_VAR"]));
});

test("keeps .env.example in sync, without copying values", () => {
  const env = "# Payments\nSTRIPE_KEY=sk_live_abc\nPORT=3000\nNEW_FLAG=on\n";
  const example = "# Copy to .env\nPORT=\nOLD_ONLY=\n";
  const report = m.compareKeys(m.parseEnv(env).entries, m.parseEnv(example).entries);
  assert.deepEqual(report, { missingInExample: ["STRIPE_KEY", "NEW_FLAG"], missingInEnv: ["OLD_ONLY"] });
  const updated = m.addToExample(example, report.missingInExample, env);
  assert.equal(updated, "# Copy to .env\nPORT=\nOLD_ONLY=\n\n# Payments\nSTRIPE_KEY=\nNEW_FLAG=\n");
  assert.ok(!updated.includes("sk_live"), "no values copied");
  assert.equal(m.addToExample("A=\r\n", ["B"]), "A=\r\n\r\nB=\r\n", "keeps Windows line endings");
  assert.equal(m.appendEntry("A=1", "B", "two words"), "A=1\nB='two words'\n");
  assert.equal(m.appendEntry("", "B"), "B=\n");
});

test("reads .gitignore patterns for env files", () => {
  assert.ok(m.gitignoreIgnores(".env\n", ".env"));
  assert.ok(m.gitignoreIgnores(".env\n", "apps/web/.env"), "an unanchored name matches in any folder");
  assert.ok(!m.gitignoreIgnores(".env\n", ".env.local"));
  assert.ok(m.gitignoreIgnores(".env*\n!.env.example\n", ".env.local"));
  assert.ok(!m.gitignoreIgnores(".env*\n!.env.example\n", ".env.example"));
  assert.ok(m.gitignoreIgnores("*.env\n", "config/production.env"));
  assert.ok(m.gitignoreIgnores("/.env\n", ".env"));
  assert.ok(!m.gitignoreIgnores("/.env\n", "apps/web/.env"), "a leading / means the root only");
  assert.ok(m.gitignoreIgnores("**/.env\n", "apps/web/.env"));
  assert.ok(m.gitignoreIgnores(".env.local\n", "packages/a/.env.local"));
  assert.ok(!m.gitignoreIgnores("node_modules\n# .env\n", ".env"));
});
