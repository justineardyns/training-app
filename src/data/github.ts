// Kleine GitHub-client voor je privé-repo. Gebruikt de Git Data API zodat een sync
// altijd precies één commit is, ook als meerdere bestanden wijzigen.

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface GitHubConfig {
  token: string;
  owner: string;
  repo: string;
  branch?: string;
  fetch?: FetchLike;
}

export class GitHubError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface TreeEntry {
  path: string;
  type: 'blob' | 'tree' | 'commit';
  sha: string;
  size?: number;
}

export type TreeChange = { path: string; sha: string | null };

const API = 'https://api.github.com';

export function utf8ToBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export function base64ToUtf8(b64: string): string {
  const bin = atob(b64.replace(/\s/g, ''));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

/** Menselijke uitleg bij een GitHub-fout. */
export function explain(err: unknown): string {
  if (err instanceof GitHubError) {
    if (err.status === 401) return 'Je token is ongeldig of verlopen. Maak een nieuw token en plak het bij Meer → Privé-repo.';
    if (err.status === 403) return 'Je token mag niet schrijven in deze repo. Geef het "Contents: Read and write".';
    if (err.status === 404) return 'Repo niet gevonden of je token heeft er geen toegang toe.';
    return `GitHub gaf fout ${err.status}: ${err.message}`;
  }
  if (err instanceof TypeError) return 'Geen verbinding. Je wijzigingen staan veilig op je iPhone en gaan later mee.';
  return err instanceof Error ? err.message : String(err);
}

export class GitHub {
  readonly branch: string;
  private f: FetchLike;
  /** Vervaldatum van het token (header van GitHub), indien bekend. */
  tokenExpires?: string;

  constructor(private cfg: GitHubConfig) {
    this.branch = cfg.branch ?? 'main';
    this.f = cfg.fetch ?? ((i, init) => fetch(i, init));
  }

  private async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await this.f(`${API}/repos/${this.cfg.owner}/${this.cfg.repo}${path}`, {
      method,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${this.cfg.token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    });
    const exp = res.headers.get('github-authentication-token-expiration');
    if (exp) this.tokenExpires = exp;
    if (!res.ok) {
      let msg = res.statusText;
      try {
        msg = ((await res.json()) as { message?: string }).message ?? msg;
      } catch {
        /* geen json */
      }
      throw new GitHubError(res.status, msg);
    }
    return (res.status === 204 ? undefined : await res.json()) as T;
  }

  repoInfo() {
    return this.call<{ private: boolean; default_branch: string; permissions?: { push?: boolean } }>('GET', '');
  }

  async head(): Promise<string> {
    const r = await this.call<{ object: { sha: string } }>('GET', `/git/ref/heads/${this.branch}`);
    return r.object.sha;
  }

  async commitTree(commitSha: string): Promise<string> {
    const c = await this.call<{ tree: { sha: string } }>('GET', `/git/commits/${commitSha}`);
    return c.tree.sha;
  }

  async tree(treeSha: string): Promise<TreeEntry[]> {
    const t = await this.call<{ tree: TreeEntry[]; truncated: boolean }>('GET', `/git/trees/${treeSha}?recursive=1`);
    return t.tree;
  }

  async blob(sha: string): Promise<string> {
    const b = await this.call<{ content: string; encoding: string }>('GET', `/git/blobs/${sha}`);
    return b.encoding === 'base64' ? base64ToUtf8(b.content) : b.content;
  }

  async createBlob(text: string): Promise<string> {
    const b = await this.call<{ sha: string }>('POST', '/git/blobs', { content: utf8ToBase64(text), encoding: 'base64' });
    return b.sha;
  }

  async createTree(baseTree: string, changes: TreeChange[]): Promise<string> {
    const t = await this.call<{ sha: string }>('POST', '/git/trees', {
      base_tree: baseTree,
      tree: changes.map((c) => ({ path: c.path, mode: '100644', type: 'blob', sha: c.sha })),
    });
    return t.sha;
  }

  async createCommit(message: string, tree: string, parent: string): Promise<string> {
    const c = await this.call<{ sha: string }>('POST', '/git/commits', { message, tree, parents: [parent] });
    return c.sha;
  }

  /** Fast-forward; faalt met 422 als iemand anders intussen pushte. */
  async updateRef(sha: string): Promise<void> {
    await this.call('PATCH', `/git/refs/heads/${this.branch}`, { sha, force: false });
  }
}
