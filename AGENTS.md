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