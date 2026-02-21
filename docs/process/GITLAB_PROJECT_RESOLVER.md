# GitHub Project Resolver (Mission Control)

> Legacy filename retained for compatibility with existing links.

Mission Control must target the correct GitHub repository when creating issues/PRs.

## Core rule (no default)
1) If the user specifies a repo alias/name/link -> use that.
2) If there is an active thread already tied to a GitHub issue/PR -> use that repo.
3) Otherwise ask exactly one question: **"Which GitHub repo should this live in?"**

## Canonical aliases (fast path)
- `ventureos` -> `zachyzissou/ventureos`
- `stanton` -> `zachgonser/stanton-times`
- `clawd` -> `zachgonser/clawd`

## Discovering other repos (smart lookup)
When the user references an unfamiliar repo name:
- Use GitHub repo search (`gh repo list` / `gh search repos`) to resolve candidates.
- Present top matches as `owner/name` + link.
- If ambiguous, ask the user to pick one.

## Examples
- "ventureos: add routing health check" -> create issue in `zachyzissou/ventureos`.
- "in zachgonser/stanton-times: fix approvals flow" -> create issue there.
- "work on the bloom repo" -> search for `bloom` and ask to confirm the intended repo.
