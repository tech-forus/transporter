# Contributing — Branching Workflow

## Branches

| Branch | Purpose | Who pushes here |
|--------|---------|-----------------|
| `main` | Production — Railway deploys from this | PRs only, never direct push |
| `dev` | Integration — always pull this before starting work | PRs only |
| `feature/your-name/description` | Your working branch | You |

## Daily workflow

```bash
# 1. Start new work — always branch off dev
git checkout dev
git pull origin dev
git checkout -b feature/yourname/what-youre-building

# 2. Work, commit often
git add <specific files>
git commit -m "short description of change"

# 3. Push your branch
git push origin feature/yourname/what-youre-building

# 4. Open PR on GitHub: feature → dev
# Other dev reviews and merges

# 5. To deploy to production: open PR dev → main
```

## Rules to avoid merge conflicts

- **Never push directly to `main` or `dev`** — always via PR
- **Pull `dev` before starting any new branch** — keeps your base fresh
- **Keep branches short-lived** — merge them within a day or two
- **One dev per feature** — if two people need to touch the same file, coordinate who goes first

## Private files (never commit these)

- `.env`, `.env.local`, `.env.production` — fill in your own values locally
- `node_modules/`, `dist/` — generated
- `.claude/` — local Claude Code config

## Private shared resources

Credentials, Gmail data, vendor Excel files, and other non-code resources are in the private `freight-compare-private` GitHub repo. Clone it separately alongside this folder.
