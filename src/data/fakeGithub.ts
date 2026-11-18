// Nagebootste GitHub (enkel voor tests): genoeg van de REST- en Git Data API om sync te testen.

interface Commit {
  tree: string;
  parent?: string;
  message: string;
}

export class FakeGitHub {
  blobs = new Map<string, string>();
  trees = new Map<string, Map<string, string>>(); // tree-sha → (pad → blob-sha)
  commits = new Map<string, Commit>();
  head: string;
  token = 'good';
  isPrivate = true;
  expires = '2027-11-01 10:00:00 UTC';
  calls: string[] = [];
  /** Laat de volgende PATCH falen alsof iemand anders net pushte. */
  raceOnce?: () => void;
  private n = 0;

  constructor(initial: Record<string, string> = { 'README.md': '# training\n' }) {
    const tree = this.makeTree(new Map(Object.entries(initial).map(([p, t]) => [p, this.putBlob(t)])));
    this.head = this.makeCommit({ tree, message: 'Initial commit' });
  }

  private id(prefix: string) {
    return `${prefix}${(++this.n).toString(16).padStart(8, '0')}`;
  }
  private putBlob(text: string) {
    const sha = this.id('b');
    this.blobs.set(sha, text);
    return sha;
  }
  private makeTree(m: Map<string, string>) {
    const sha = this.id('t');
    this.trees.set(sha, m);
    return sha;
  }
  private makeCommit(c: Commit) {
    const sha = this.id('c');
    this.commits.set(sha, c);
    return sha;
  }

  /** Huidige bestanden op main (pad → tekst). */
  files(): Record<string, string> {
    const tree = this.trees.get(this.commits.get(this.head)!.tree)!;
    return Object.fromEntries([...tree].map(([p, b]) => [p, this.blobs.get(b)!]));
  }

  /** Iemand anders (Opdracht, /coach) pusht een wijziging. */
  externalCommit(changes: Record<string, string | null>, message = 'extern') {
    const tree = new Map(this.trees.get(this.commits.get(this.head)!.tree)!);
    for (const [p, t] of Object.entries(changes)) {
      if (t === null) tree.delete(p);
      else tree.set(p, this.putBlob(t));
    }
    this.head = this.makeCommit({ tree: this.makeTree(tree), parent: this.head, message });
  }

  messages(): string[] {
    const out: string[] = [];
    for (let c: string | undefined = this.head; c; c = this.commits.get(c)!.parent) out.push(this.commits.get(c)!.message);
    return out;
  }

  fetch = async (url: string, init: RequestInit = {}): Promise<Response> => {
    const method = (init.method ?? 'GET').toUpperCase();
    const auth = (init.headers as Record<string, string> | undefined)?.Authorization;
    const path = new URL(url).pathname.replace(/^\/repos\/[^/]+\/[^/]+/, '');
    this.calls.push(`${method} ${path}`);
    const json = (status: number, body: unknown) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json', 'github-authentication-token-expiration': this.expires },
      });
    if (auth !== `Bearer ${this.token}`) return json(401, { message: 'Bad credentials' });
    const body = init.body ? JSON.parse(String(init.body)) : undefined;

    if (method === 'GET' && path === '') return json(200, { private: this.isPrivate, default_branch: 'main', permissions: { push: true } });
    if (method === 'GET' && path === '/git/ref/heads/main') return json(200, { object: { sha: this.head } });
    let m = path.match(/^\/git\/commits\/(\w+)$/);
    if (method === 'GET' && m) {
      const c = this.commits.get(m[1]!);
      return c ? json(200, { tree: { sha: c.tree } }) : json(404, { message: 'Not Found' });
    }
    m = path.match(/^\/git\/trees\/(\w+)$/);
    if (method === 'GET' && m) {
      const t = this.trees.get(m[1]!);
      if (!t) return json(404, { message: 'Not Found' });
      return json(200, { truncated: false, tree: [...t].map(([p, sha]) => ({ path: p, type: 'blob', sha, mode: '100644' })) });
    }
    m = path.match(/^\/git\/blobs\/(\w+)$/);
    if (method === 'GET' && m) {
      const text = this.blobs.get(m[1]!);
      if (text === undefined) return json(404, { message: 'Not Found' });
      return json(200, { encoding: 'base64', content: Buffer.from(text, 'utf8').toString('base64') });
    }
    if (method === 'POST' && path === '/git/blobs') {
      const text = body.encoding === 'base64' ? Buffer.from(body.content, 'base64').toString('utf8') : body.content;
      return json(201, { sha: this.putBlob(text) });
    }
    if (method === 'POST' && path === '/git/trees') {
      const base = this.trees.get(body.base_tree);
      if (!base) return json(422, { message: 'base_tree niet gevonden' });
      const t = new Map(base);
      for (const e of body.tree as { path: string; sha: string | null }[]) {
        if (e.sha === null) {
          if (!t.has(e.path)) return json(422, { message: `pad bestaat niet: ${e.path}` });
          t.delete(e.path);
        } else t.set(e.path, e.sha);
      }
      return json(201, { sha: this.makeTree(t) });
    }
    if (method === 'POST' && path === '/git/commits') {
      return json(201, { sha: this.makeCommit({ tree: body.tree, parent: body.parents[0], message: body.message }) });
    }
    if (method === 'PATCH' && path === '/git/refs/heads/main') {
      if (this.raceOnce) {
        const r = this.raceOnce;
        this.raceOnce = undefined;
        r();
      }
      const c = this.commits.get(body.sha);
      if (!c || c.parent !== this.head) return json(422, { message: 'Update is not a fast forward' });
      this.head = body.sha;
      return json(200, { object: { sha: this.head } });
    }
    return json(404, { message: `Niet nagebootst: ${method} ${path}` });
  };
}
