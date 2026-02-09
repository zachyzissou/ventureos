# GitLab Project Resolver (Mission Control)

Mission Control must be able to target the correct GitLab project when creating Issues/MRs.

## Core rule (no default)
1) If the user specifies a project alias/name/link → use that.
2) If there is an active thread already tied to a GitLab issue/MR → use that project.
3) Otherwise ask exactly one question: **“Which GitLab project should this live in?”**

## Canonical aliases (fast path)
- `ventureos` → `zachgonser/ventureos`
- `stanton` → `zachgonser/stanton-times`
- `clawd` → `zachgonser/clawd`

## Discovering other projects (smart lookup)
When the user references an unfamiliar project name:
- Use GitLab search (`list_projects search=<query>`) to resolve candidates.
- Present **top 3 matches** as `path_with_namespace` + link.
- If ambiguous, ask the user to pick one.

## Examples
- “ventureos: add routing health check” → create issue in `zachgonser/ventureos`.
- “in zachgonser/stanton-times: fix approvals flow” → create issue there.
- “work on the bloom repo” → search for `bloom` and ask to confirm the intended project.
