// Bundles the extension with esbuild.
//
// The MongoDB driver ships client-side field level encryption, which Query Lens never uses. Two of its files hold
// a PEM private-key template and start the mongocryptd process; saslprep unpacks a compressed table at start-up;
// and the URL parser calls eval() and carries Unicode tables on lines of up to 188,000 characters.
// The Marketplace's malware scan flags such code, so those parts are replaced with plain equivalents here.
import { build } from "esbuild";
import fs from "node:fs";

const UNSUPPORTED = "Client-side field level encryption is not included in Veyra Query Lens.";
const stubs = {
  crypto_callbacks: `"use strict";
const unsupported = () => { throw new Error(${JSON.stringify(UNSUPPORTED)}); };
exports.makeAES256Hook = () => unsupported;
exports.makeHmacHook = () => unsupported;
exports.randomHook = unsupported;
exports.sha256Hook = unsupported;
exports.signRsaSha256Hook = unsupported;
exports.aes256CbcEncryptHook = exports.aes256CbcDecryptHook = exports.aes256CtrEncryptHook = exports.aes256CtrDecryptHook = unsupported;
exports.hmacSha512Hook = exports.hmacSha256Hook = unsupported;
`,
  mongocryptd_manager: `"use strict";
class MongocryptdManager { constructor() { throw new Error(${JSON.stringify(UNSUPPORTED)}); } }
exports.MongocryptdManager = MongocryptdManager;
`,
};

const plugin = {
  name: "veyra-clean-driver",
  setup(b) {
    b.onLoad({ filter: /client-side-encryption[\\/](crypto_callbacks|mongocryptd_manager)\.js$/ }, args => {
      const name = /(crypto_callbacks|mongocryptd_manager)\.js$/.exec(args.path)[1];
      return { contents: stubs[name], loader: "js" };
    });
    // saslprep (password normalization for SCRAM-SHA-256) unpacks a gzipped, base64-encoded table at start-up.
    // The package also ships the same table as readable code (code-points-src.js): use that instead.
    b.onLoad({ filter: /@mongodb-js[\\/]saslprep[\\/]dist[\\/]node\.js$/ }, () => ({
      loader: "js",
      contents: `"use strict";
const index = require("./index");
const src = require("./code-points-src");
const wrap = set => ({ get: codePoint => set.has(codePoint) });
const codePoints = {
  unassigned_code_points: wrap(src.unassigned_code_points),
  commonly_mapped_to_nothing: wrap(src.commonly_mapped_to_nothing),
  non_ASCII_space_characters: wrap(src.non_ASCII_space_characters),
  prohibited_characters: wrap(src.prohibited_characters),
  bidirectional_r_al: wrap(src.bidirectional_r_al),
  bidirectional_l: wrap(src.bidirectional_l),
};
function saslprep(input, opts) { return index.default(codePoints, input, opts); }
saslprep.saslprep = saslprep;
saslprep.default = saslprep;
module.exports = saslprep;
`,
    }));
    // mongodb-connection-string-url only needs the URL and URLSearchParams classes from whatwg-url. Node.js has the
    // same standard classes built in, so whatwg-url (with its eval() call and 200 KB of Unicode tables) is left out.
    b.onResolve({ filter: /^whatwg-url$/ }, () => ({ path: "whatwg-url", namespace: "veyra-node-url" }));
    b.onLoad({ filter: /.*/, namespace: "veyra-node-url" }, () => ({ loader: "js", contents: "module.exports = { URL: globalThis.URL, URLSearchParams: globalThis.URLSearchParams };" }));
  },
};

await build({
  entryPoints: ["src/extension.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node18",
  outfile: "bundle/extension.js",
  logLevel: "warning",
  external: ["vscode", "kerberos", "@mongodb-js/zstd", "snappy", "mongodb-client-encryption", "@aws-sdk/credential-providers", "gcp-metadata", "socks", "aws4"],
  plugins: [plugin],
});

// Fail the build if anything a malware scan would flag is still there.
const out = fs.readFileSync("bundle/extension.js", "utf8");
const flagged = [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, /\beval\s*\(/, /require\("child_process"\)/, /new Function\(/, /[A-Za-z0-9+/]{400,}={0,2}/, /gunzipSync\(Buffer\.from\(/, /^.{2000,}$/m].filter(re => re.test(out));
if (flagged.length) { console.error("bundle still contains:", flagged.map(String).join(", ")); process.exit(1); }
