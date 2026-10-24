import { spawn } from "node:child_process";
import { LOG_FORMAT, REF_FORMAT, UNCOMMITTED, parseChanges, parseLog, parseRefs, parseStatus, type Commit, type FileChange, type Ref } from "./model";

/** git's well-known empty tree, to compare a first commit against. */
const EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";

export class GitError extends Error {
  constructor(readonly args: string[], readonly output: string, readonly code: number | null) { super(output.trim() || `git ${args[0]} failed`); }
}

/** Runs git in one repository. Arguments are passed as a list, never through a shell. */
export class Git {
  constructor(readonly path: string, readonly root: string) {}

  run(args: string[], options: { input?: string } = {}): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn(this.path, args, { cwd: this.root, windowsHide: true, env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_OPTIONAL_LOCKS: "0", LC_ALL: "C" } });
      const out: Buffer[] = [], err: Buffer[] = [];
      child.stdout.on("data", d => out.push(d));
      child.stderr.on("data", d => err.push(d));
      child.on("error", e => reject(new GitError(args, e.message, null)));
      child.on("close", code => {
        const stdout = Buffer.concat(out).toString("utf8");
        if (code === 0) resolve(stdout);
        else reject(new GitError(args, Buffer.concat(err).toString("utf8") || stdout, code));
      });
      if (options.input !== undefined) child.stdin.end(options.input); else child.stdin.end();
    });
  }

  /** Commits for the graph, newest first, children always before their parents. */
  async log(options: { max: number; skip: number; branch?: string; remotes: boolean }): Promise<{ commits: Commit[]; more: boolean }> {
    const which = options.branch ? [options.branch] : options.remotes ? ["--branches", "--tags", "--remotes", "HEAD"] : ["--branches", "--tags", "HEAD"];
    const args = ["-c", "log.showSignature=false", "log", `--format=${LOG_FORMAT}`, "--date-order", `--max-count=${options.max + 1}`, `--skip=${options.skip}`, ...which, "--"];
    let text: string;
    try { text = await this.run(args); }
    catch (e) { if (/does not have any commits|bad default revision|unknown revision/i.test((e as GitError).output)) return { commits: [], more: false }; throw e; }
    const commits = parseLog(text);
    return { commits: commits.slice(0, options.max), more: commits.length > options.max };
  }

  async refs(): Promise<Ref[]> { return parseRefs(await this.run(["for-each-ref", `--format=${REF_FORMAT}`, "refs/heads", "refs/remotes", "refs/tags"])); }

  async head(): Promise<{ hash?: string; branch?: string }> {
    const hash = (await this.run(["rev-parse", "--verify", "-q", "HEAD"]).catch(() => "")).trim() || undefined;
    const branch = (await this.run(["symbolic-ref", "--short", "-q", "HEAD"]).catch(() => "")).trim() || undefined;
    return { hash, branch };
  }

  async status(): Promise<FileChange[]> { return parseStatus(await this.run(["status", "--porcelain=v1", "-z", "--untracked-files=all"])); }

  /** The files a commit changed compared with its first parent (or with another commit). */
  async changes(hash: string, base?: string): Promise<FileChange[]> {
    const from = base ?? (await this.parentsOf(hash))[0] ?? EMPTY_TREE;
    const [names, nums] = await Promise.all([
      this.run(["diff", "--name-status", "-z", "-M", "--no-ext-diff", from, hash, "--"]),
      this.run(["diff", "--numstat", "-z", "-M", "--no-ext-diff", from, hash, "--"]),
    ]);
    return parseChanges(names, nums);
  }

  async parentsOf(hash: string): Promise<string[]> {
    return (await this.run(["rev-list", "--parents", "-n", "1", hash])).trim().split(" ").slice(1);
  }

  /** Everything the details pane shows about one commit. */
  async details(hash: string) {
    const text = await this.run(["show", "-s", "--format=%H%x1f%P%x1f%an%x1f%ae%x1f%at%x1f%cn%x1f%ce%x1f%ct%x1f%B", hash]);
    const [h, parents, author, email, date, committer, committerEmail, committed, ...body] = text.split("\x1f");
    return { hash: h, parents: parents.split(" ").filter(Boolean), author, email, date: Number(date), committer, committerEmail, committed: Number(committed), body: body.join("\x1f").trim() };
  }

  /** What changed in the working tree, as a row above HEAD. */
  async uncommitted(head?: string): Promise<Commit | undefined> {
    const files = await this.status();
    if (!files.length) return undefined;
    return { hash: UNCOMMITTED, parents: head ? [head] : [], author: "", email: "", date: Math.floor(Date.now() / 1000), subject: `Uncommitted changes (${files.length})` };
  }
}

export { EMPTY_TREE };
