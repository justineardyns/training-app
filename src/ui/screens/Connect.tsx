// Koppeling met je privé-repo. De echte GitHub-sync volgt in fase 3; tot dan werkt alles lokaal.

export function ConnectRepo(props: { onDone: (restored: boolean) => void; onSkip: () => void }) {
  return (
    <div class="stack">
      <div class="card">
        <p>Je data komt in je eigen privé-repo op GitHub. Tot die koppeling er is, bewaart de app alles veilig op je iPhone.</p>
      </div>
      <button class="btn primary" onClick={props.onSkip}>
        Later koppelen
      </button>
    </div>
  );
}
