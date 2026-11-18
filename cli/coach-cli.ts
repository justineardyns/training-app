// Coach-CLI: dezelfde coachlogica als de app, voor GitHub Actions (meldingen) en /coach.
// Wordt gebundeld naar dist/coach-cli.mjs en gepubliceerd op GitHub Pages.
const VERSION = process.env.COACH_VERSION ?? 'dev';

async function main(argv: string[]) {
  const [cmd] = argv;
  switch (cmd) {
    case 'version':
    case undefined:
      console.log(`coach-cli ${VERSION}`);
      return;
    default:
      console.error(`Onbekend commando: ${cmd}`);
      process.exitCode = 1;
  }
}

main(process.argv.slice(2)).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
