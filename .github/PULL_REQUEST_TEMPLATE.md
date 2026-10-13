## What and why

<!-- What this changes, and the issue it closes (Closes #…). -->

## Checklist

- [ ] `claude plugin validate --strict . && npx -y -p typescript@5 tsc -p . && claude plugin test .` passes locally
- [ ] Tests cover the change (written first, seen failing)
- [ ] Displayed strings live in `hooks/strings.ts`
- [ ] `/sst debug` still shows nothing local
- [ ] A line under *Unreleased* in `CHANGELOG.md`, if a user would notice
- [ ] Screenshot attached, if the UI changes
