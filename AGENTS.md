{
    "commands":  {
                     "restart":  true,
                     "native":  "auto"
                 },
    "models":  {
                   "default":  "anthropic/claude-sonnet-4-5"
               },
    "tools":  {
                  "web":  {
                              "search":  {
                                             "apiKey":  "BSAW1ZNoEGBXmYuZhy_o2MaRfx8yctI"
                                         }
                          },
                  "memory":  {
                                 "enabled":  true,
                                 "mode":  "persistent",
                                 "databases":  [
                                                   "/Users/zachgonser/.openclaw/memory/main.sqlite",
                                                   "/Users/zachgonser/clawd/memory/stanton-times.sqlite"
                                               ],
                                 "chunk_tokens":  400,
                                 "chunk_overlap":  80
                             }
              },
    "docs":  {
                 "policy":  {
                                 "goals_constraints":  "/Users/zachgonser/clawd/projects/openclaw-upgrade/docs/GOALS_CONSTRAINTS.md",
                                 "guardrails":  "/Users/zachgonser/clawd/projects/openclaw-upgrade/docs/GUARDRAILS.md",
                                 "proactive_mode":  "/Users/zachgonser/clawd/projects/openclaw-upgrade/docs/PROACTIVE_MODE.md",
                                 "model_strategy":  "/Users/zachgonser/clawd/projects/openclaw-upgrade/docs/MODEL_STRATEGY.md",
                                 "budget_policy":  "/Users/zachgonser/clawd/projects/openclaw-upgrade/docs/BUDGET_POLICY.md",
                                 "ops_runbook":  "/Users/zachgonser/clawd/projects/openclaw-upgrade/docs/OPS_RUNBOOK.md"
                             },
                 "doc_index":  "/Users/zachgonser/clawd/projects/openclaw-upgrade/docs/DOC_INDEX.md"
             },
    "meta":  {
                 "lastTouchedVersion":  "2026.1.24-3",
                 "memory_migration_date":  "2026-02-01"
             },
    "auth":  {
                 "profiles":  {
                                  "anthropic:default":  {
                                                            "mode":  "token",
                                                            "provider":  "anthropic"
                                                        }
                              }
             }
}