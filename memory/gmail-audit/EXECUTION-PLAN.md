# Gmail Reorganization - Execution Plan

**Account:** zachgonser@gmail.com
**Created:** 2026-01-28 01:33 CST
**Status:** 📋 Planning

---

## Overview

This plan reorganizes Gmail with zero data loss. Every action is reversible until Phase 5.

**Goals:**
1. Consolidate duplicate label hierarchies (emoji wins)
2. Update filters to target emoji labels
3. Create new filters for uncategorized high-volume senders
4. Clean up empty/orphan labels
5. Establish ongoing maintenance

---

## Phase 1: Email Migration (Non-Destructive)

**Objective:** Move emails from non-emoji labels to emoji equivalents.

**Batch 1: Newsletters**
```
Source: Newsletters (Label_18) → Target: 📰 Newsletters (Label_20)
Source: Newsletters/Tech-AI (Label_46) → Target: 📰 Newsletters/Tech-AI (Label_21)
```
- Search: `label:Newsletters`
- For each thread: Add emoji label, remove plain label
- Rate limit: 20 threads per batch, 5-second delay between batches

**Batch 2: Shopping**
```
Source: Shopping/Deals (Label_52) → Target: 🛒 Shopping/Deals (Label_27)
Source: Shopping/Cannabis (Label_53) → Target: 🛒 Shopping/Cannabis (Label_28)
```

**Batch 3: Security**
```
Source: Security/Logins (Label_61) → Target: 🔐 Security/Logins (Label_37)
Source: Security/Verification (Label_62) → Target: 🔐 Security/Verification (Label_38)
Source: Security Alerts/Google (Label_1299508093724075565) → Target: 🔐 Security/Logins (Label_37)
```

**Batch 4: Financial**
```
Source: Financial/Subscriptions (Label_64) → Target: 💰 Financial/Subscriptions (Label_41)
Source: Financial/Paypal Receipts (Label_5492261333926184688) → Target: 💰 Financial/Receipts (Label_40)
Source: Receipts (Label_5) → Target: 💰 Financial/Receipts (Label_40)
Source: Indexer Receipts (Label_3390527203184852850) → Target: 💰 Financial/Receipts (Label_40)
```

**Batch 5: eBay**
```
Source: eBay (Label_65) → Target: 📦 eBay (Label_42)
Source: eBay/Orders (Label_66) → Target: 📦 eBay/Orders (Label_43)
Source: eBay/Messages (Label_67) → Target: 📦 eBay/Messages (Label_44)
```

**Batch 6: Gaming/Patreon**
```
Source: Patreon (Label_2664901152156221069) → Target: 🎮 Gaming/Patreon (Label_32)
```

### Migration Commands (via gog CLI)

```powershell
# Example: Migrate Newsletters
$threads = gog gmail search "label:Newsletters" --account=zachgonser@gmail.com --max=50 --json | ConvertFrom-Json
foreach ($t in $threads.threads) {
    gog gmail thread modify $t.id --add-label "Label_20" --remove-label "Label_18" --account=zachgonser@gmail.com
    Start-Sleep -Seconds 2
}
```

---

## Phase 2: Filter Updates

**Existing Filters to Modify:**

| Filter | Current Target | New Target | Action |
|--------|---------------|------------|--------|
| Patreon (@patreon.com) | Patreon | 🎮 Gaming/Patreon | Update |
| PayPal receipts | Financial/Paypal Receipts | 💰 Financial/Receipts | Update |
| Security Alerts/Google | Security Alerts/Google | 🔐 Security/Logins | Update |
| Possible Finance | Financial/Possible Notifications | 💰 Financial | Update or Delete |
| Bandcamp | Bandcamp | Keep as-is or create 🎵 Music | Review |
| Invitehawk | Invitehawk | Keep as-is | No change |

**Filter Update Commands:**

```powershell
# Update Patreon filter
# 1. Get filter ID
gog gmail settings filters list --account=zachgonser@gmail.com --json

# 2. Delete old filter, create new one with emoji label
gog gmail settings filters delete FILTER_ID --account=zachgonser@gmail.com
gog gmail settings filters create --from "@patreon.com" --add-label "Label_32" --account=zachgonser@gmail.com
```

---

## Phase 3: New Filters

**Create filters for high-volume uncategorized senders:**

| Criteria | Label | Skip Inbox? |
|----------|-------|-------------|
| `from:@substack.com` | 📰 Newsletters | Yes |
| `from:mail1.fsastore.com` | 🛒 Shopping/Deals | Yes |
| `from:email.feverup.com` | 🛒 Shopping/Deals | Yes |
| `from:notify.fromjapan.co.jp` | 🛒 Shopping/Deals | Yes |
| `from:tracking@shipstation.com OR from:pkginfo@ups.com` | 📦 Orders/Shipping | No |
| `from:failed-payments*@stripe.com` | 💰 Financial/Alerts | No (important!) |
| `from:noreply@steampowered.com` | 🎮 Gaming | Yes |
| `from:noreply@discord.com` | 🎮 Gaming | Yes |
| `subject:"security alert" OR subject:"new login"` | 🔐 Security/Logins | No |

---

## Phase 4: Label Cleanup

**Labels to Hide (not delete yet):**
- `[Mailbox]` tree (5 labels)
- `Personal`
- `Travel`
- `Orders/Shipping` (empty)
- `zachgonser@me.com`

**Labels to Delete (after verification):**
- `Aloe City World` (empty, no filter)
- `BoostHill Recepts` (typo, empty)
- `Financial/Music` (empty)

**Duplicate Labels to Delete (after Phase 1 complete):**
- All non-emoji versions of migrated labels

---

## Phase 5: Verification & Cleanup

**Verification Steps:**
1. Search each emoji label - confirm emails present
2. Search each old label - confirm empty
3. Test each updated filter with new email
4. Review inbox for proper categorization

**Final Cleanup:**
- Delete empty migrated-from labels
- Update label visibility (hide system labels if desired)
- Document final state

---

## Rate Limit Strategy

| Operation | Quota Cost | Max Per Minute | Delay |
|-----------|-----------|----------------|-------|
| Search | 5 units | 50 | 1.2s |
| Thread modify | 50 units | 5 | 12s |
| Filter create | 10 units | 25 | 2.4s |
| Filter delete | 10 units | 25 | 2.4s |

**Batch sizes:**
- Migration: 20 threads per batch
- 5-second delay between batches
- 60-second pause between phases

---

## Rollback Plan

If something goes wrong:
1. Emails still exist (labels are additive)
2. Old labels still exist until Phase 5
3. Can re-add old labels to any thread
4. Filters can be restored from documented state

---

## Implementation Order

1. ✅ Run Phase 1 Migration Agent (120+ threads migrated)
2. ✅ Verify migrations complete (cleanup passes ran)
3. ✅ Run Phase 2 Filter Update Agent (4 filters updated)
4. ✅ Verify filters working
5. ✅ Run Phase 3 New Filter Agent (11 filters total)
6. ✅ Test new filters (eBay, receipts filters added post-verification)
7. ✅ Run Phase 4 Cleanup Agent (11 labels verified empty)
8. ✅ Final verification (FINAL-REPORT.md generated)
9. ⚠️ Phase 5 deletion - gog CLI lacks delete/hide commands, labels ready for manual deletion

---

## Agent Assignments

| Phase | Agent Label | Timeout | Notes |
|-------|-------------|---------|-------|
| 1 | gmail-migration | 20 min | Largest task |
| 2 | gmail-filter-update | 10 min | Small batch |
| 3 | gmail-filter-create | 10 min | Small batch |
| 4 | gmail-cleanup | 10 min | Hide labels |
| 5 | Manual | N/A | Human approval |

