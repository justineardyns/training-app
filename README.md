# training-app

Gratis personal-trainer-PWA voor iPhone: plant je trainingen binnen vaste regels,
vult elke set vooraf in, regelt progressie, deloads, dagvorm en blessures, en werkt offline.

**Deze repo bevat enkel code — nooit persoonlijke data.** Je trainings- en
gezondheidsdata staan in een aparte privé-repo die de app via de GitHub API gebruikt.

Installatie-instructies volgen in fase 6.

## Ontwikkelen

```bash
npm ci
npm run dev       # lokale server
npm test          # unit tests (coachlogica)
npm run e2e       # smoke-test in iPhone-formaat
npm run build     # productie-build + coach-cli in dist/
```
