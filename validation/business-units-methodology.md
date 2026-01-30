# Business Units Validation Methodology

**Created:** 2026-01-30  
**Status:** 🟡 Ready for Implementation  
**Priority:** P0 - Revenue Protection  
**Parent:** VALIDATION-SELF-HEALING-ARCHITECTURE.md (Section 3)

---

## Executive Summary

This document defines the **complete validation methodology** for business units within Echo. Each business unit represents a revenue stream or value creation engine. Downtime = lost money. Quality issues = reputation damage. This methodology ensures:

- **99.9% uptime** for all business-critical operations
- **Zero undetected failures** (catch issues within 5 minutes)
- **Automated recovery** for 95%+ of common failures
- **Revenue protection** through P0 alerting on money-losing issues

---

## Table of Contents

1. [StantonTimes Validation](#stantontimes-validation)
2. [Bloom (Low Noise Studios) Validation](#bloom-low-noise-studios-validation)
3. [Generic Business Unit Framework](#generic-business-unit-framework)
4. [Self-Healing Actions Catalog](#self-healing-actions-catalog)
5. [Implementation Checklist](#implementation-checklist)
6. [Revenue Impact Detection](#revenue-impact-detection)
7. [Testing Strategy](#testing-strategy)

---

## StantonTimes Validation

### Business Context

**What:** AI-powered Twitter account posting political satire/commentary  
**Revenue Model:** Engagement → Audience growth → Brand value  
**Critical Success Factors:**
- Consistent posting (6x per day minimum)
- Content quality (no hallucinations, errors, or offensive content)
- Engagement tracking (metrics inform future strategy)
- Approval flow (quality gate before publishing)

### Health KPIs

| Metric | Target | Warning Threshold | Critical Threshold |
|--------|--------|-------------------|-------------------|
| Posts per day | 6-8 | <5 | <3 |
| Approval queue depth | 0-2 | >5 | >10 |
| Approval queue age (max) | <2 hours | >6 hours | >24 hours |
| Failed post attempts | 0 | >2/day | >5/day |
| Engagement rate | >1% | <0.5% | <0.2% |
| Error rate (content) | 0% | >0.1% | >1% |
| Twitter API errors | 0 | >3/hour | >10/hour |

### Validation Checks

#### 1. Cron Job Health (Every 5 minutes)

**What to Check:**
- All 6 cron jobs are enabled and executing on schedule
- No failed executions in last 24 hours
- Execution time within normal range (detect hung jobs)

**Validation Logic:**
```python
def validate_stantontimes_cron_health():
    """Validate all StantonTimes cron jobs are healthy."""
    
    expected_jobs = [
        "stantontimes-p0-monitor",      # Every 15 min
        "stantontimes-p1-search",       # Every 30 min
        "stantontimes-p2-trending",     # Every 1 hour
        "stantontimes-approval-check",  # Every 10 min
        "stantontimes-metrics-sync",    # Every 1 hour
        "stantontimes-auth-refresh",    # Every 6 hours
    ]
    
    issues = []
    
    for job_name in expected_jobs:
        # Check last run time
        last_run = get_cron_last_run(job_name)
        expected_interval = get_cron_interval(job_name)
        
        if not last_run:
            issues.append({
                "severity": "P0",
                "job": job_name,
                "issue": "Never executed",
                "action": "investigate_cron_config"
            })
        elif (now() - last_run) > expected_interval * 2:
            issues.append({
                "severity": "P1",
                "job": job_name,
                "issue": f"Hasn't run in {now() - last_run}",
                "action": "restart_cron_job"
            })
        
        # Check for failures
        recent_failures = get_cron_failures(job_name, last_24h=True)
        if recent_failures > 3:
            issues.append({
                "severity": "P1",
                "job": job_name,
                "issue": f"{recent_failures} failures in 24h",
                "action": "analyze_failure_logs"
            })
    
    return issues
```

**Self-Healing:**
- **Action:** Restart stuck cron jobs
- **Trigger:** Job hasn't run in 2x expected interval
- **Implementation:**
  ```bash
  clawdbot cron disable "stantontimes-p0-monitor"
  clawdbot cron enable "stantontimes-p0-monitor"
  ```
- **Fallback:** If restart fails 3x, alert P0

#### 2. Posting Validation (Every 15 minutes)

**What to Check:**
- Posts are actually appearing on Twitter (not just locally logged)
- Post frequency matches expected cadence (6-8 per day)
- No posts stuck in "pending" state
- Tweet IDs are being captured and logged

**Validation Logic:**
```python
def validate_stantontimes_posting():
    """Validate tweets are being posted successfully."""
    
    issues = []
    
    # Check posting frequency
    posts_today = count_posts_today()
    hour_of_day = datetime.now().hour
    
    # Expected posts scales by time of day
    # By 3pm, should have ~3 posts minimum
    expected_by_now = min(6, hour_of_day / 4)
    
    if posts_today < expected_by_now and hour_of_day > 6:
        issues.append({
            "severity": "P1",
            "issue": f"Only {posts_today} posts today (expected {expected_by_now}+)",
            "action": "check_approval_queue"
        })
    
    # Check for stuck posts
    pending_posts = get_pending_posts()
    for post in pending_posts:
        age = now() - post.created_at
        if age > timedelta(hours=2):
            issues.append({
                "severity": "P2",
                "issue": f"Post stuck in pending for {age}",
                "post_id": post.id,
                "action": "retry_post"
            })
    
    # Check for failed posts
    failed_posts = get_failed_posts(last_24h=True)
    if len(failed_posts) > 2:
        issues.append({
            "severity": "P1",
            "issue": f"{len(failed_posts)} failed posts in 24h",
            "action": "investigate_twitter_auth"
        })
    
    # Validate actual Twitter presence (not just local state)
    if posts_today > 0:
        latest_post_id = get_latest_post_id()
        tweet_exists = verify_tweet_exists(latest_post_id)
        
        if not tweet_exists:
            issues.append({
                "severity": "P0",
                "issue": "Latest post not found on Twitter (auth issue?)",
                "action": "refresh_twitter_cookies"
            })
    
    return issues
```

**Self-Healing:**
- **Action:** Retry failed tweet posts (with exponential backoff)
- **Trigger:** Post stuck in pending >2 hours OR post failed with retryable error
- **Implementation:**
  ```python
  def retry_failed_post(post_id, attempt=1):
      max_attempts = 3
      backoff = 2 ** attempt  # 2, 4, 8 minutes
      
      if attempt > max_attempts:
          alert("P1", f"Post {post_id} failed after {max_attempts} retries")
          return False
      
      # Wait before retry
      time.sleep(backoff * 60)
      
      # Re-attempt post
      result = post_to_twitter(post_id)
      
      if result.success:
          log(f"Post {post_id} succeeded on retry {attempt}")
          return True
      else:
          return retry_failed_post(post_id, attempt + 1)
  ```

#### 3. Approval Flow Validation (Every 10 minutes)

**What to Check:**
- Pending queue is being processed (not stuck)
- Queue depth is healthy (<5 items)
- No approvals older than 24 hours
- Approval-to-post pipeline is flowing

**Validation Logic:**
```python
def validate_stantontimes_approval_flow():
    """Validate approval queue is healthy and flowing."""
    
    issues = []
    
    # Load approval state
    state = load_json("stantontimes/state.json")
    pending = state.get("pending_queue", [])
    
    # Check queue depth
    if len(pending) > 10:
        issues.append({
            "severity": "P1",
            "issue": f"Approval queue backed up ({len(pending)} items)",
            "action": "alert_for_review"
        })
    elif len(pending) > 5:
        issues.append({
            "severity": "P2",
            "issue": f"Approval queue growing ({len(pending)} items)",
            "action": "monitor_closely"
        })
    
    # Check for stale approvals
    for item in pending:
        age = now() - datetime.fromisoformat(item["created_at"])
        
        if age > timedelta(hours=48):
            issues.append({
                "severity": "P1",
                "issue": f"Approval stuck for {age.hours}h",
                "item_id": item["id"],
                "action": "auto_approve_or_reject"
            })
        elif age > timedelta(hours=6):
            issues.append({
                "severity": "P3",
                "issue": f"Approval aging ({age.hours}h)",
                "item_id": item["id"],
                "action": "remind_human"
            })
    
    # Check if approvals are being processed
    last_approval_action = state.get("last_approval_action")
    if last_approval_action:
        time_since = now() - datetime.fromisoformat(last_approval_action)
        if time_since > timedelta(hours=24) and len(pending) > 0:
            issues.append({
                "severity": "P2",
                "issue": "No approval actions in 24h despite pending items",
                "action": "alert_for_attention"
            })
    
    return issues
```

**Self-Healing:**
- **Action:** Auto-clear stuck approval queue items
- **Trigger:** Item older than 48 hours
- **Logic:**
  - If item has been seen/viewed by human but not decided: Auto-approve (human implicitly trusts it)
  - If item has never been viewed: Auto-reject (too old, not timely)
  - Log decision and reasoning
- **Implementation:**
  ```python
  def auto_clear_stuck_approvals():
      state = load_json("stantontimes/state.json")
      pending = state["pending_queue"]
      now_time = datetime.now()
      
      for item in pending[:]:  # Copy to allow mutation
          age = now_time - datetime.fromisoformat(item["created_at"])
          
          if age > timedelta(hours=48):
              # Decision logic
              if item.get("viewed_by_human"):
                  # Human saw it, didn't reject → implicit approval
                  action = "approve"
                  reason = "Auto-approved: viewed but not rejected within 48h"
              else:
                  # Too old, not timely anymore
                  action = "reject"
                  reason = "Auto-rejected: stale content (>48h)"
              
              # Execute action
              if action == "approve":
                  post_to_twitter(item)
              
              # Remove from queue
              pending.remove(item)
              
              # Log decision
              log_approval_decision(item["id"], action, reason, auto=True)
      
      save_json("stantontimes/state.json", state)
  ```

#### 4. Content Quality Validation (Every post)

**What to Check:**
- No hallucinated facts (validate claims against known data)
- No offensive/problematic language (brand safety)
- No formatting errors (broken links, malformed text)
- Tone/style matches brand voice

**Validation Logic:**
```python
def validate_post_quality(post_content):
    """Pre-publication quality checks."""
    
    issues = []
    
    # 1. Check for offensive content (basic filters)
    offensive_patterns = [
        r'\b(slur1|slur2)\b',  # Replace with actual patterns
        r'extremely offensive phrase',
    ]
    
    for pattern in offensive_patterns:
        if re.search(pattern, post_content, re.IGNORECASE):
            issues.append({
                "severity": "P0",
                "issue": f"Offensive content detected: {pattern}",
                "action": "block_publication"
            })
    
    # 2. Check for broken formatting
    # - Unmatched quotes
    if post_content.count('"') % 2 != 0:
        issues.append({
            "severity": "P3",
            "issue": "Unmatched quotes",
            "action": "flag_for_review"
        })
    
    # - Invalid URLs
    urls = re.findall(r'http[s]?://\S+', post_content)
    for url in urls:
        if not validate_url(url):
            issues.append({
                "severity": "P2",
                "issue": f"Invalid URL: {url}",
                "action": "flag_for_review"
            })
    
    # 3. Check length (Twitter limits)
    if len(post_content) > 280:
        issues.append({
            "severity": "P0",
            "issue": f"Tweet too long ({len(post_content)} chars)",
            "action": "block_publication"
        })
    
    # 4. Brand voice check (basic)
    # StantonTimes should be satirical/witty, not earnest
    earnest_indicators = ["sincerely", "genuinely believe", "heartfelt"]
    if any(indicator in post_content.lower() for indicator in earnest_indicators):
        issues.append({
            "severity": "P3",
            "issue": "Post may be too earnest for satire brand",
            "action": "flag_for_review"
        })
    
    return issues
```

**Self-Healing:**
- **Action:** Block publication of unsafe content
- **Trigger:** P0 quality issue detected
- **Implementation:**
  - Move post to "blocked" queue
  - Alert human with reason
  - Do NOT auto-publish
  - Require manual override to publish

#### 5. Engagement Tracking Validation (Every hour)

**What to Check:**
- Metrics are being fetched from Twitter API
- Engagement data is updating (not stale)
- Trends are being captured (likes, retweets, replies)
- No anomalies (sudden drop = shadowban?)

**Validation Logic:**
```python
def validate_stantontimes_engagement():
    """Validate engagement metrics are tracking correctly."""
    
    issues = []
    
    # Check metrics freshness
    metrics_file = "stantontimes/engagement-metrics.json"
    if not file_exists(metrics_file):
        issues.append({
            "severity": "P2",
            "issue": "Engagement metrics file missing",
            "action": "initialize_metrics_tracking"
        })
        return issues
    
    metrics = load_json(metrics_file)
    last_update = datetime.fromisoformat(metrics.get("last_updated", "2000-01-01"))
    
    if (now() - last_update) > timedelta(hours=3):
        issues.append({
            "severity": "P2",
            "issue": f"Metrics stale ({now() - last_update})",
            "action": "trigger_metrics_sync"
        })
    
    # Check for engagement anomalies
    recent_posts = metrics.get("recent_posts", [])
    if len(recent_posts) >= 5:
        avg_engagement = sum(p["engagement_rate"] for p in recent_posts[-5:]) / 5
        latest_engagement = recent_posts[-1]["engagement_rate"]
        
        # Sudden drop in engagement
        if latest_engagement < avg_engagement * 0.3 and avg_engagement > 0.5:
            issues.append({
                "severity": "P1",
                "issue": f"Engagement dropped {((1 - latest_engagement/avg_engagement) * 100):.0f}%",
                "action": "investigate_shadowban"
            })
    
    # Check API health
    api_errors = metrics.get("api_errors", [])
    recent_errors = [e for e in api_errors if (now() - datetime.fromisoformat(e["timestamp"])) < timedelta(hours=1)]
    
    if len(recent_errors) > 5:
        issues.append({
            "severity": "P1",
            "issue": f"{len(recent_errors)} Twitter API errors in last hour",
            "action": "refresh_twitter_auth"
        })
    
    return issues
```

**Self-Healing:**
- **Action:** Trigger metrics sync if stale
- **Implementation:**
  ```bash
  # Manually trigger metrics update
  clawdbot cron run "stantontimes-metrics-sync" --force
  ```

#### 6. Twitter Authentication Validation (Every 6 hours)

**What to Check:**
- Cookies are still valid (not expired)
- Auth tokens working (test with read operation)
- No rate limiting issues
- Session hasn't been invalidated

**Validation Logic:**
```python
def validate_twitter_auth():
    """Validate Twitter authentication is healthy."""
    
    issues = []
    
    # Test auth with simple read operation
    try:
        result = twitter_api.verify_credentials()
        if not result.success:
            issues.append({
                "severity": "P0",
                "issue": "Twitter auth failed verification",
                "action": "refresh_cookies"
            })
    except Exception as e:
        issues.append({
            "severity": "P0",
            "issue": f"Twitter API error: {str(e)}",
            "action": "refresh_cookies"
        })
    
    # Check cookie expiry
    cookies = load_twitter_cookies()
    for cookie in cookies:
        if cookie.get("expiry"):
            expiry = datetime.fromtimestamp(cookie["expiry"])
            if expiry < now() + timedelta(hours=24):
                issues.append({
                    "severity": "P1",
                    "issue": f"Cookie '{cookie['name']}' expires in <24h",
                    "action": "refresh_cookies"
                })
    
    # Check rate limits
    rate_limit = twitter_api.get_rate_limit_status()
    if rate_limit.remaining < rate_limit.limit * 0.1:
        issues.append({
            "severity": "P2",
            "issue": f"Twitter rate limit low ({rate_limit.remaining}/{rate_limit.limit})",
            "action": "throttle_requests"
        })
    
    return issues
```

**Self-Healing:**
- **Action:** Auto-refresh Twitter cookies
- **Trigger:** Auth verification fails OR cookies expiring within 24h
- **Implementation:**
  ```python
  def refresh_twitter_cookies():
      """Refresh Twitter authentication cookies."""
      
      # This would typically involve:
      # 1. Re-authenticating with browser automation (Playwright)
      # 2. Capturing new cookies
      # 3. Saving to cookies.json
      # 4. Testing new auth
      
      # For now, alert human if automated refresh fails
      try:
          new_cookies = playwright_twitter_login()
          save_twitter_cookies(new_cookies)
          
          # Verify new cookies work
          if twitter_api.verify_credentials().success:
              log("Twitter cookies refreshed successfully")
              return True
          else:
              raise Exception("New cookies don't work")
      
      except Exception as e:
          alert("P0", f"Failed to refresh Twitter cookies: {str(e)}")
          return False
  ```

---

## Bloom (Low Noise Studios) Validation

### Business Context

**What:** Unity game development studio  
**Revenue Model:** Game sales, consulting, IP licensing  
**Critical Success Factors:**
- CI/CD reliability (broken builds block all work)
- Code quality (bugs = delayed releases)
- Storage management (GitHub LFS quota is limited and expensive)
- Unity project integrity (corruption = days of lost work)

### Health KPIs

| Metric | Target | Warning Threshold | Critical Threshold |
|--------|--------|-------------------|-------------------|
| CI build success rate | >95% | <90% | <80% |
| PR review time (median) | <24h | >48h | >72h |
| Open PRs age (max) | <7 days | >14 days | >30 days |
| GitHub LFS quota used | <70% | >80% | >90% |
| Unity compile errors | 0 | >5 | >20 |
| Failed CI jobs (per day) | 0 | >3 | >10 |
| Test coverage | >70% | <60% | <50% |

### Validation Checks

#### 1. CI/CD Health Validation (Every 15 minutes)

**What to Check:**
- GitHub Actions workflows are passing
- No repeated failures on same test
- Build times within normal range (detect performance regression)
- Artifacts are being generated and uploaded

**Validation Logic:**
```python
def validate_bloom_ci_health():
    """Validate CI/CD pipeline is healthy."""
    
    issues = []
    
    # Get recent workflow runs
    workflows = github_api.get_workflow_runs("bloom", limit=20)
    
    # Calculate success rate
    recent_runs = workflows[:10]
    failures = [w for w in recent_runs if w.status == "failure"]
    success_rate = (len(recent_runs) - len(failures)) / len(recent_runs)
    
    if success_rate < 0.8:
        issues.append({
            "severity": "P0",
            "issue": f"CI success rate critically low ({success_rate*100:.0f}%)",
            "action": "investigate_failing_tests"
        })
    elif success_rate < 0.9:
        issues.append({
            "severity": "P1",
            "issue": f"CI success rate degraded ({success_rate*100:.0f}%)",
            "action": "review_recent_failures"
        })
    
    # Check for repeated failures (flaky tests)
    failure_reasons = {}
    for failure in failures:
        reason = failure.get("conclusion_reason", "unknown")
        failure_reasons[reason] = failure_reasons.get(reason, 0) + 1
    
    for reason, count in failure_reasons.items():
        if count >= 3:
            issues.append({
                "severity": "P2",
                "issue": f"Flaky test detected: '{reason}' failed {count}x",
                "action": "auto_retry_flaky_test"
            })
    
    # Check build times (performance regression)
    build_times = [w.duration for w in recent_runs if w.status == "success"]
    if len(build_times) >= 5:
        avg_time = sum(build_times) / len(build_times)
        latest_time = build_times[0]
        
        if latest_time > avg_time * 1.5:
            issues.append({
                "severity": "P3",
                "issue": f"Build time increased {((latest_time/avg_time - 1) * 100):.0f}%",
                "action": "investigate_performance_regression"
            })
    
    # Check for stuck workflows
    running_workflows = [w for w in workflows if w.status == "in_progress"]
    for workflow in running_workflows:
        runtime = now() - workflow.started_at
        if runtime > timedelta(hours=1):
            issues.append({
                "severity": "P1",
                "issue": f"Workflow stuck for {runtime}",
                "workflow_id": workflow.id,
                "action": "cancel_stuck_workflow"
            })
    
    return issues
```

**Self-Healing:**
- **Action:** Auto-rerun failed CI builds (if failure looks transient)
- **Trigger:** Build fails with known flaky error OR network timeout
- **Implementation:**
  ```python
  def auto_retry_failed_build(workflow_run_id):
      """Retry a failed CI build if failure is retryable."""
      
      # Get failure details
      workflow = github_api.get_workflow_run(workflow_run_id)
      logs = github_api.get_workflow_logs(workflow_run_id)
      
      # Check if failure is retryable
      retryable_patterns = [
          "network timeout",
          "connection reset",
          "503 service unavailable",
          "failed to download",
          "temporary failure",
      ]
      
      is_retryable = any(pattern in logs.lower() for pattern in retryable_patterns)
      
      if is_retryable:
          log(f"Retrying workflow {workflow_run_id} (transient failure detected)")
          github_api.rerun_workflow(workflow_run_id)
          return True
      else:
          # Not retryable, alert human
          alert("P1", f"CI build failed with non-transient error: {workflow.conclusion_reason}")
          return False
  ```

#### 2. PR Monitoring Validation (Every 30 minutes)

**What to Check:**
- PRs are being reviewed in reasonable time
- No PRs stuck in "changes requested" limbo
- PR merge rate is healthy (work is flowing)
- No conflict hell (multiple PRs blocking each other)

**Validation Logic:**
```python
def validate_bloom_pr_health():
    """Validate PR workflow is healthy."""
    
    issues = []
    
    # Get open PRs
    prs = github_api.get_pull_requests("bloom", state="open")
    
    # Check PR age
    for pr in prs:
        age = now() - pr.created_at
        
        if age > timedelta(days=30):
            issues.append({
                "severity": "P1",
                "issue": f"PR #{pr.number} open for {age.days} days",
                "pr_number": pr.number,
                "action": "alert_stale_pr"
            })
        elif age > timedelta(days=14):
            issues.append({
                "severity": "P2",
                "issue": f"PR #{pr.number} aging ({age.days} days)",
                "pr_number": pr.number,
                "action": "remind_reviewer"
            })
    
    # Check for review delays
    for pr in prs:
        if not pr.reviews or len(pr.reviews) == 0:
            # No reviews yet
            time_since_creation = now() - pr.created_at
            
            if time_since_creation > timedelta(hours=72):
                issues.append({
                    "severity": "P1",
                    "issue": f"PR #{pr.number} has no reviews after {time_since_creation.hours}h",
                    "pr_number": pr.number,
                    "action": "alert_for_review"
                })
            elif time_since_creation > timedelta(hours=48):
                issues.append({
                    "severity": "P2",
                    "issue": f"PR #{pr.number} needs review",
                    "pr_number": pr.number,
                    "action": "remind_reviewer"
                })
        else:
            # Has reviews, check if "changes requested"
            latest_review = pr.reviews[-1]
            if latest_review.state == "changes_requested":
                time_since_review = now() - latest_review.submitted_at
                
                if time_since_review > timedelta(days=7):
                    issues.append({
                        "severity": "P2",
                        "issue": f"PR #{pr.number} has unaddressed changes for {time_since_review.days} days",
                        "pr_number": pr.number,
                        "action": "ping_author"
                    })
    
    # Check for merge conflicts
    conflicted_prs = [pr for pr in prs if pr.mergeable_state == "dirty"]
    if len(conflicted_prs) > 3:
        issues.append({
            "severity": "P2",
            "issue": f"{len(conflicted_prs)} PRs have merge conflicts",
            "action": "alert_conflict_resolution_needed"
        })
    
    return issues
```

**Self-Healing:**
- **Action:** Auto-alert on PR review delays >48h
- **Trigger:** PR created >48h ago with no reviews
- **Implementation:**
  ```python
  def alert_pr_review_needed(pr_number):
      """Alert about PR needing review."""
      
      pr = github_api.get_pull_request("bloom", pr_number)
      
      # Determine who should review (based on CODEOWNERS or past reviewers)
      reviewers = get_suggested_reviewers(pr)
      
      # Send alert
      message = f"""
      🔔 PR Review Needed
      
      **PR #{pr.number}:** {pr.title}
      **Author:** {pr.author}
      **Age:** {(now() - pr.created_at).days} days
      **Status:** No reviews yet
      
      Suggested reviewers: {', '.join(reviewers)}
      
      Link: {pr.html_url}
      """
      
      send_discord_dm(message)
  ```

#### 3. GitHub LFS Quota Monitoring (Every hour)

**What to Check:**
- Current LFS storage usage
- Trend (are we approaching limit?)
- Large files recently added (catch mistakes)
- Quota remaining vs. burn rate

**Validation Logic:**
```python
def validate_bloom_lfs_quota():
    """Validate GitHub LFS quota is healthy."""
    
    issues = []
    
    # Get LFS usage
    lfs_usage = github_api.get_lfs_usage("bloom")
    quota = lfs_usage.quota
    used = lfs_usage.used
    percentage = (used / quota) * 100
    
    if percentage > 90:
        issues.append({
            "severity": "P0",
            "issue": f"LFS quota critically low ({percentage:.1f}% used)",
            "used_gb": used / (1024**3),
            "quota_gb": quota / (1024**3),
            "action": "emergency_lfs_cleanup"
        })
    elif percentage > 80:
        issues.append({
            "severity": "P1",
            "issue": f"LFS quota warning ({percentage:.1f}% used)",
            "used_gb": used / (1024**3),
            "quota_gb": quota / (1024**3),
            "action": "cleanup_old_lfs_files"
        })
    elif percentage > 70:
        issues.append({
            "severity": "P2",
            "issue": f"LFS quota approaching limit ({percentage:.1f}% used)",
            "used_gb": used / (1024**3),
            "quota_gb": quota / (1024**3),
            "action": "audit_lfs_usage"
        })
    
    # Check for recent large files (>100MB)
    recent_commits = github_api.get_commits("bloom", limit=10)
    for commit in recent_commits:
        large_files = [f for f in commit.files if f.size > 100 * 1024 * 1024]
        
        for file in large_files:
            issues.append({
                "severity": "P3",
                "issue": f"Large file added: {file.path} ({file.size / (1024**2):.1f} MB)",
                "commit": commit.sha,
                "action": "verify_intended"
            })
    
    # Calculate burn rate (if we have historical data)
    historical_usage = load_json("bloom/lfs-usage-history.json")
    if len(historical_usage) >= 7:
        week_ago_usage = historical_usage[-7]["used"]
        daily_burn = (used - week_ago_usage) / 7
        days_until_full = (quota - used) / daily_burn if daily_burn > 0 else float('inf')
        
        if days_until_full < 30:
            issues.append({
                "severity": "P1",
                "issue": f"LFS quota will be full in {days_until_full:.0f} days at current rate",
                "action": "plan_quota_increase_or_cleanup"
            })
    
    # Save current usage to history
    historical_usage.append({"timestamp": now().isoformat(), "used": used})
    save_json("bloom/lfs-usage-history.json", historical_usage[-30:])  # Keep last 30 days
    
    return issues
```

**Self-Healing:**
- **Action:** Auto-clean LFS cache if quota approaching
- **Trigger:** >80% quota used
- **Implementation:**
  ```bash
  # Clean up old LFS files not referenced by recent branches
  cd /path/to/bloom-repo
  
  # Find LFS objects not in recent commits (>90 days old)
  git lfs prune --verify-remote --recent --verbose
  
  # If still over quota, remove older unreferenced objects
  git lfs prune --verify-remote --older-than 90d
  
  # Force push to update remote
  git push --force
  ```

#### 4. Unity Project Integrity Validation (Every commit)

**What to Check:**
- Unity project compiles without errors
- No missing asset references (broken links)
- Scene files are not corrupted
- Project settings are valid

**Validation Logic:**
```python
def validate_unity_project_integrity():
    """Validate Unity project is in good state."""
    
    issues = []
    
    # Run Unity in batch mode to compile project
    result = subprocess.run([
        "/Applications/Unity/Hub/Editor/2022.3.0f1/Unity.app/Contents/MacOS/Unity",
        "-batchmode",
        "-projectPath", "/path/to/bloom",
        "-buildTarget", "StandaloneOSX",
        "-quit",
        "-logFile", "/tmp/unity-compile.log"
    ], capture_output=True, timeout=600)
    
    # Parse log for errors
    log_content = open("/tmp/unity-compile.log").read()
    
    # Look for compile errors
    compile_errors = re.findall(r'CompilerOutput: (.+?) \(', log_content)
    if compile_errors:
        issues.append({
            "severity": "P0",
            "issue": f"{len(compile_errors)} Unity compile errors",
            "errors": compile_errors[:5],  # First 5
            "action": "alert_developer"
        })
    
    # Look for missing asset references
    missing_assets = re.findall(r'Missing asset reference: (.+)', log_content)
    if missing_assets:
        issues.append({
            "severity": "P1",
            "issue": f"{len(missing_assets)} missing asset references",
            "assets": missing_assets[:5],
            "action": "verify_asset_integrity"
        })
    
    # Check for corrupted scenes
    scene_errors = re.findall(r'Scene (.+?) is corrupted', log_content)
    if scene_errors:
        issues.append({
            "severity": "P0",
            "issue": f"Corrupted scenes detected: {', '.join(scene_errors)}",
            "action": "restore_from_backup"
        })
    
    # Verify Unity version consistency
    project_version = get_unity_project_version("/path/to/bloom")
    expected_version = "2022.3.0f1"
    
    if project_version != expected_version:
        issues.append({
            "severity": "P2",
            "issue": f"Unity version mismatch (project: {project_version}, expected: {expected_version})",
            "action": "update_project_version"
        })
    
    return issues
```

**Self-Healing:**
- **Action:** Auto-revert commits that break Unity build
- **Trigger:** Compile errors in CI build
- **Implementation:**
  ```python
  def auto_revert_breaking_commit(commit_sha):
      """Revert a commit that broke Unity build."""
      
      # Verify this commit actually broke the build
      # (by checking previous commit was passing)
      
      previous_commit = get_previous_commit(commit_sha)
      previous_build = get_ci_build_for_commit(previous_commit)
      
      if previous_build.status == "success":
          # Previous was good, this broke it
          log(f"Auto-reverting breaking commit {commit_sha}")
          
          # Create revert commit
          subprocess.run(["git", "revert", commit_sha, "--no-edit"])
          subprocess.run(["git", "push"])
          
          # Alert developer
          alert("P1", f"Auto-reverted commit {commit_sha} (broke Unity build)")
          
          return True
      else:
          # Build was already broken, don't auto-revert
          alert("P1", f"Unity build broken by {commit_sha}, but previous also broken")
          return False
  ```

---

## Generic Business Unit Framework

This framework allows rapid onboarding of new business units with minimal configuration.

### Business Unit Definition Schema

```json
{
  "unit_id": "example-business",
  "name": "Example Business Unit",
  "type": "service|product|content|consulting",
  "revenue_model": "subscription|one-time|advertising|leads",
  "priority": "P0|P1|P2|P3",
  
  "health_kpis": [
    {
      "metric": "daily_active_users",
      "target": 100,
      "warning_threshold": 50,
      "critical_threshold": 10,
      "measurement_frequency": "1h"
    }
  ],
  
  "validation_checks": [
    {
      "check_id": "api_health",
      "frequency": "5m",
      "validation_script": "scripts/validate_api.py",
      "self_healing": {
        "enabled": true,
        "actions": ["restart_service", "clear_cache"],
        "max_auto_retries": 3
      }
    }
  ],
  
  "alerting": {
    "p0_channels": ["discord_dm", "sms"],
    "p1_channels": ["discord_dm"],
    "p2_channels": ["discord_dm"],
    "p3_channels": ["daily_digest"]
  },
  
  "dependencies": [
    "twitter_api",
    "openai_api",
    "database"
  ]
}
```

### Generic Validation Template

```python
class BusinessUnitValidator:
    """Generic validator for any business unit."""
    
    def __init__(self, unit_config):
        self.config = unit_config
        self.unit_id = unit_config["unit_id"]
    
    def run_all_checks(self):
        """Run all validation checks for this unit."""
        all_issues = []
        
        for check in self.config["validation_checks"]:
            issues = self.run_check(check)
            all_issues.extend(issues)
        
        return all_issues
    
    def run_check(self, check_config):
        """Run a single validation check."""
        script = check_config["validation_script"]
        
        # Execute validation script
        result = subprocess.run([script], capture_output=True)
        
        # Parse results (assuming JSON output)
        issues = json.loads(result.stdout)
        
        # Attempt self-healing if enabled
        if check_config["self_healing"]["enabled"]:
            for issue in issues:
                if issue["can_auto_heal"]:
                    self.attempt_self_heal(issue, check_config["self_healing"])
        
        return issues
    
    def attempt_self_heal(self, issue, healing_config):
        """Attempt to self-heal an issue."""
        actions = healing_config["actions"]
        max_retries = healing_config["max_auto_retries"]
        
        for attempt in range(max_retries):
            for action in actions:
                success = self.execute_healing_action(action, issue)
                
                if success:
                    log(f"Self-healed {issue['id']} with action '{action}'")
                    return True
            
            # Wait before retry
            time.sleep(2 ** attempt)
        
        # Failed to self-heal
        alert(issue["severity"], f"Failed to self-heal: {issue['description']}")
        return False
    
    def execute_healing_action(self, action, issue):
        """Execute a specific healing action."""
        # Map action names to implementations
        actions = {
            "restart_service": self.restart_service,
            "clear_cache": self.clear_cache,
            "rotate_credentials": self.rotate_credentials,
            "retry_operation": self.retry_operation,
        }
        
        if action in actions:
            return actions[action](issue)
        else:
            log(f"Unknown healing action: {action}")
            return False
    
    def check_health_kpis(self):
        """Check if all KPIs are within healthy ranges."""
        issues = []
        
        for kpi in self.config["health_kpis"]:
            current_value = self.get_metric_value(kpi["metric"])
            
            if current_value < kpi["critical_threshold"]:
                issues.append({
                    "severity": "P0",
                    "metric": kpi["metric"],
                    "current": current_value,
                    "threshold": kpi["critical_threshold"],
                    "status": "critical"
                })
            elif current_value < kpi["warning_threshold"]:
                issues.append({
                    "severity": "P1",
                    "metric": kpi["metric"],
                    "current": current_value,
                    "threshold": kpi["warning_threshold"],
                    "status": "warning"
                })
        
        return issues
```

### Adding a New Business Unit

**Step 1:** Create unit configuration file
```bash
cat > /Users/zachgonser/clawd/business-units/new-unit-config.json << EOF
{
  "unit_id": "new-unit",
  "name": "New Business Unit",
  ...
}
EOF
```

**Step 2:** Implement validation scripts
```bash
mkdir -p /Users/zachgonser/clawd/business-units/new-unit/scripts
```

**Step 3:** Register with Monitor-Agent
```python
# In monitor-agent config
register_business_unit("business-units/new-unit-config.json")
```

**Step 4:** Test validation
```bash
python monitor-agent.py --test-unit new-unit
```

---

## Self-Healing Actions Catalog

### 1. Auto-Retry Failed Tweet Posts

**Trigger:** Tweet post fails with retryable error  
**Action:**
```python
def retry_failed_tweet(tweet_id, max_attempts=3):
    for attempt in range(1, max_attempts + 1):
        # Exponential backoff
        if attempt > 1:
            time.sleep(2 ** attempt * 60)  # 2, 4, 8 minutes
        
        try:
            result = post_tweet(tweet_id)
            if result.success:
                log(f"Tweet {tweet_id} posted on attempt {attempt}")
                return True
        except Exception as e:
            log(f"Tweet {tweet_id} attempt {attempt} failed: {e}")
    
    alert("P1", f"Tweet {tweet_id} failed after {max_attempts} retries")
    return False
```

**Retryable Errors:**
- Network timeout
- 503 Service Unavailable
- Rate limit (wait and retry)
- Temporary Twitter issues

**Non-Retryable Errors (alert immediately):**
- 401 Unauthorized (auth broken)
- 403 Forbidden (account suspended)
- 400 Bad Request (content issue)

### 2. Auto-Clear Stuck Approval Queues

**Trigger:** Approval item older than 48 hours  
**Action:**
```python
def auto_clear_stuck_approval(item):
    # Decision logic
    if item.get("viewed_by_human") and not item.get("decision_made"):
        # Human saw it but didn't reject → approve
        decision = "approve"
        reason = "Auto-approved: viewed but undecided for 48h"
    elif item.get("created_at") < now() - timedelta(hours=48):
        # Too old, not timely
        decision = "reject"
        reason = "Auto-rejected: content stale (>48h)"
    
    # Execute
    execute_approval_decision(item, decision, reason, auto=True)
    
    # Log
    log_approval(item.id, decision, reason, automated=True)
    
    # Notify human
    send_notification(f"Auto-{decision}ed approval: {item.content[:100]}... (Reason: {reason})")
```

### 3. Auto-Rerun Failed CI Builds

**Trigger:** CI build fails with known flaky error  
**Action:**
```python
def auto_rerun_failed_ci(workflow_run_id):
    # Get failure logs
    logs = github_api.get_workflow_logs(workflow_run_id)
    
    # Classify failure
    flaky_indicators = [
        "network timeout",
        "connection reset",
        "temporary failure",
        "resource temporarily unavailable",
    ]
    
    is_flaky = any(indicator in logs.lower() for indicator in flaky_indicators)
    
    if is_flaky:
        log(f"Rerunning flaky build {workflow_run_id}")
        github_api.rerun_workflow(workflow_run_id)
        return True
    else:
        alert("P1", f"CI build {workflow_run_id} failed (non-flaky)")
        return False
```

### 4. Auto-Alert on PR Review Delays >48h

**Trigger:** PR open for >48h with no reviews  
**Action:**
```python
def alert_pr_review_delay(pr_number):
    pr = github_api.get_pull_request("bloom", pr_number)
    age = now() - pr.created_at
    
    # Determine reviewers
    reviewers = get_codeowners_for_pr(pr) or get_recent_reviewers() or ["@team"]
    
    # Send alert
    message = f"""
    🚨 PR Review Needed
    
    **PR #{pr.number}:** {pr.title}
    **Age:** {age.hours} hours
    **Author:** {pr.author}
    
    Reviewers needed: {', '.join(reviewers)}
    
    {pr.html_url}
    """
    
    send_discord_dm(message)
    
    # Also comment on PR
    github_api.create_comment(
        "bloom",
        pr.number,
        f"⏰ This PR has been open for {age.hours} hours with no reviews. CC: {' '.join(reviewers)}"
    )
```

### 5. Auto-Clean LFS Cache if Quota Approaching

**Trigger:** GitHub LFS quota >80% used  
**Action:**
```bash
#!/bin/bash
# auto-clean-lfs.sh

QUOTA_PERCENT=$(get_lfs_quota_percent)

if [ "$QUOTA_PERCENT" -gt 80 ]; then
    echo "LFS quota at ${QUOTA_PERCENT}%, cleaning old files..."
    
    cd /path/to/bloom
    
    # Remove LFS objects not in recent commits
    git lfs prune --verify-remote --recent
    
    # If still over 80%, prune older objects
    QUOTA_PERCENT=$(get_lfs_quota_percent)
    if [ "$QUOTA_PERCENT" -gt 80 ]; then
        git lfs prune --verify-remote --older-than 180d
    fi
    
    # Report results
    NEW_QUOTA=$(get_lfs_quota_percent)
    echo "LFS quota after cleanup: ${NEW_QUOTA}%"
    
    if [ "$NEW_QUOTA" -lt 80 ]; then
        log "LFS cleanup successful: ${QUOTA_PERCENT}% → ${NEW_QUOTA}%"
    else
        alert "P1" "LFS cleanup failed to bring quota below 80%"
    fi
fi
```

### 6. Auto-Restart Stuck Cron Jobs

**Trigger:** Cron job hasn't run in 2x expected interval  
**Action:**
```bash
#!/bin/bash
# auto-restart-cron.sh

JOB_NAME=$1

# Disable job
clawdbot cron disable "$JOB_NAME"

# Wait 5 seconds
sleep 5

# Re-enable job
clawdbot cron enable "$JOB_NAME"

# Verify it runs within expected interval
sleep 300  # Wait 5 minutes

LAST_RUN=$(clawdbot cron status "$JOB_NAME" | grep "last_run")
if [ -z "$LAST_RUN" ]; then
    alert "P0" "Failed to restart cron job: $JOB_NAME"
else
    log "Successfully restarted cron job: $JOB_NAME"
fi
```

### 7. Auto-Refresh Twitter Authentication

**Trigger:** Twitter API returns 401 Unauthorized  
**Action:**
```python
def auto_refresh_twitter_auth():
    """Refresh Twitter cookies using browser automation."""
    
    from playwright.sync_api import sync_playwright
    
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)  # Need visible for CAPTCHA
        context = browser.new_context()
        page = context.new_page()
        
        # Navigate to Twitter
        page.goto("https://twitter.com/login")
        
        # Fill credentials (from secure storage)
        credentials = get_twitter_credentials()
        page.fill('input[name="text"]', credentials["username"])
        page.click('text=Next')
        page.fill('input[name="password"]', credentials["password"])
        page.click('text=Log in')
        
        # Wait for login
        page.wait_for_url("https://twitter.com/home", timeout=30000)
        
        # Extract cookies
        cookies = context.cookies()
        
        # Save cookies
        save_twitter_cookies(cookies)
        
        browser.close()
    
    # Test new auth
    if verify_twitter_auth():
        log("Twitter auth refreshed successfully")
        return True
    else:
        alert("P0", "Failed to refresh Twitter auth (manual intervention needed)")
        return False
```

---

## Implementation Checklist

### Phase 1: StantonTimes Monitoring (Week 1)

- [ ] **Cron Job Health Validation**
  - [ ] Parse cron logs for last run times
  - [ ] Detect stuck jobs (>2x interval)
  - [ ] Implement auto-restart
  - [ ] Test with intentional failure
  
- [ ] **Posting Validation**
  - [ ] Track posts per day
  - [ ] Verify tweets on Twitter (not just local state)
  - [ ] Implement retry logic for failed posts
  - [ ] Test with network failures
  
- [ ] **Approval Flow Validation**
  - [ ] Monitor queue depth
  - [ ] Track approval age
  - [ ] Implement auto-clear for stuck items (>48h)
  - [ ] Test with artificial stuck approvals
  
- [ ] **Content Quality Validation**
  - [ ] Build pre-publish quality checks
  - [ ] Detect offensive content
  - [ ] Check formatting errors
  - [ ] Test with problematic content

- [ ] **Engagement Tracking Validation**
  - [ ] Fetch metrics from Twitter API
  - [ ] Detect stale metrics (>3h old)
  - [ ] Trigger manual sync if needed
  - [ ] Test metrics pipeline

- [ ] **Twitter Auth Validation**
  - [ ] Check cookie expiry
  - [ ] Test auth with API call
  - [ ] Implement auto-refresh (browser automation)
  - [ ] Test auth failure recovery

### Phase 2: Bloom Monitoring (Week 2)

- [ ] **CI/CD Health Validation**
  - [ ] Monitor GitHub Actions workflows
  - [ ] Calculate success rate
  - [ ] Detect flaky tests
  - [ ] Implement auto-retry for transient failures
  - [ ] Test with artificial CI failures
  
- [ ] **PR Monitoring**
  - [ ] Track open PR age
  - [ ] Detect review delays (>48h)
  - [ ] Send alerts for stale PRs
  - [ ] Test alert logic
  
- [ ] **LFS Quota Monitoring**
  - [ ] Fetch current usage from GitHub API
  - [ ] Track usage trend
  - [ ] Implement auto-cleanup (>80%)
  - [ ] Test cleanup script
  
- [ ] **Unity Integrity Validation**
  - [ ] Run Unity in batch mode (compile check)
  - [ ] Parse logs for errors
  - [ ] Detect missing assets
  - [ ] Test with broken Unity project

### Phase 3: Generic Framework (Week 3)

- [ ] **Business Unit Schema**
  - [ ] Define JSON schema for unit config
  - [ ] Create example configs (StantonTimes, Bloom)
  - [ ] Build validator for schema
  
- [ ] **Generic Validator Class**
  - [ ] Implement BusinessUnitValidator
  - [ ] Support custom validation scripts
  - [ ] Integrate with Monitor-Agent
  - [ ] Test with example units
  
- [ ] **Self-Healing Framework**
  - [ ] Build action registry (map names → functions)
  - [ ] Implement common actions (restart, retry, clear cache)
  - [ ] Test healing success/failure paths
  
- [ ] **Onboarding Process**
  - [ ] Document how to add new business unit
  - [ ] Create template files
  - [ ] Build validation test suite
  - [ ] Test with mock business unit

### Phase 4: E2E Testing (Week 4)

- [ ] **StantonTimes E2E Tests**
  - [ ] Simulate full posting workflow (search → approve → post)
  - [ ] Test failure scenarios (auth failure, rate limit, network error)
  - [ ] Verify self-healing works
  - [ ] Measure time to detection and recovery
  
- [ ] **Bloom E2E Tests**
  - [ ] Simulate CI failure → auto-retry → success
  - [ ] Test PR review delay alerts
  - [ ] Simulate LFS quota breach → cleanup
  - [ ] Test Unity compile error detection
  
- [ ] **Cross-Unit Tests**
  - [ ] Test dependency failures (Twitter API down)
  - [ ] Test cascading failures (one unit affects another)
  - [ ] Test Monitor-Agent under load
  
- [ ] **Performance Tests**
  - [ ] Measure check execution time (<5s per check)
  - [ ] Test with 10+ units running simultaneously
  - [ ] Verify no memory leaks over 24h
  - [ ] Test alert rate limiting (avoid spam)

### Phase 5: Production Deployment

- [ ] **Pre-Deployment Checklist**
  - [ ] All validation checks passing in staging
  - [ ] Self-healing tested with real failures
  - [ ] Alerting configured correctly
  - [ ] Dashboard auto-updating
  - [ ] Runbook documented for manual interventions
  
- [ ] **Deployment**
  - [ ] Deploy Monitor-Agent to production
  - [ ] Enable checks one-by-one (gradual rollout)
  - [ ] Monitor for false positives (tune thresholds)
  - [ ] Verify alerts are received
  
- [ ] **Post-Deployment Monitoring**
  - [ ] Track MTTD (mean time to detection)
  - [ ] Track MTTR (mean time to resolution)
  - [ ] Measure auto-heal success rate
  - [ ] Collect feedback on alert usefulness
  
- [ ] **Optimization**
  - [ ] Tune alert thresholds (reduce noise)
  - [ ] Add new self-healing actions based on patterns
  - [ ] Improve validation logic (catch more issues)
  - [ ] Document learnings in runbook

---

## Revenue Impact Detection

### P0: Money-Losing Issues (Immediate Alert)

**Definition:** Any issue that directly blocks revenue generation or causes active revenue loss.

**Examples:**
- **StantonTimes:** Cannot post tweets (audience growth stopped)
- **Bloom:** Cannot deploy game (sales blocked)
- **Consulting:** Lead form broken (losing inbound leads)
- **Talent Service:** Application submission failing (missing opportunities)

**Detection Logic:**
```python
def detect_revenue_impact(issue):
    """Classify issue by revenue impact."""
    
    revenue_blocking_patterns = {
        "stantontimes": [
            "cannot post tweets",
            "twitter auth broken",
            "all cron jobs failing",
        ],
        "bloom": [
            "cannot build",
            "deployment blocked",
            "critical bug in production",
        ],
        "consulting": [
            "lead form broken",
            "email system down",
            "website offline",
        ],
    }
    
    for unit, patterns in revenue_blocking_patterns.items():
        if issue["unit_id"] == unit:
            for pattern in patterns:
                if pattern in issue["description"].lower():
                    return "P0_REVENUE_BLOCKING"
    
    return issue.get("severity", "P2")
```

**Response:**
- **Alert:** Immediate (Discord DM + SMS)
- **Escalation:** If not resolved in 15 minutes, escalate
- **Self-Healing:** Attempt all available fixes
- **Logging:** Track downtime duration for post-mortem

### Revenue Impact Metrics

**Track for each business unit:**
- **Uptime %** (time operational vs. total time)
- **Downtime duration** (minutes per month)
- **Revenue lost** (estimated $ per minute of downtime)
- **Recovery time** (mean time to resolution)

**Example Dashboard:**
```markdown
## Revenue Impact (Last 30 Days)

| Business Unit | Uptime | Downtime | Est. Revenue Lost | Incidents |
|---------------|--------|----------|-------------------|-----------|
| StantonTimes | 99.8% | 87 min | $0 (no monetization yet) | 3 |
| Bloom | 99.5% | 216 min | ~$500 (delayed launch) | 5 |
| Consulting | 99.9% | 43 min | ~$1,200 (missed leads) | 2 |

**Total Revenue Protected:** $1,700  
**Cost of Monitoring:** $50/month  
**ROI:** 34x
```

---

## Testing Strategy

### Unit Tests (Each Validation Check)

**Test Structure:**
```python
def test_stantontimes_cron_health():
    """Test cron health validation logic."""
    
    # Setup: Mock cron status
    mock_cron_status = {
        "stantontimes-p0-monitor": {
            "last_run": now() - timedelta(hours=1),  # Overdue
            "interval": timedelta(minutes=15),
        }
    }
    
    # Execute validation
    issues = validate_stantontimes_cron_health(mock_cron_status)
    
    # Assert issue detected
    assert len(issues) == 1
    assert issues[0]["severity"] == "P1"
    assert "hasn't run" in issues[0]["issue"].lower()
```

**Coverage Goals:**
- 100% of validation checks have unit tests
- Test both healthy state (no issues) and failure states
- Test edge cases (boundary conditions)

### Integration Tests (E2E Workflows)

**Test Structure:**
```python
def test_stantontimes_post_retry_workflow():
    """Test full post retry workflow."""
    
    # Setup: Create failed post
    post_id = create_test_post(content="Test tweet")
    simulate_post_failure(post_id, error="network timeout")
    
    # Execute: Run validation
    issues = validate_stantontimes_posting()
    
    # Assert: Issue detected
    assert any(i["post_id"] == post_id for i in issues)
    
    # Execute: Self-healing
    success = retry_failed_post(post_id)
    
    # Assert: Post succeeded on retry
    assert success
    assert get_post_status(post_id) == "posted"
```

**Coverage Goals:**
- All self-healing actions tested E2E
- Failure scenarios tested (network error, auth failure, etc.)
- Verify alerts sent correctly

### Stress Tests (Scale & Performance)

**Test Structure:**
```python
def test_monitor_agent_under_load():
    """Test Monitor-Agent with high load."""
    
    # Setup: Register 50 business units
    for i in range(50):
        register_business_unit(f"test-unit-{i}")
    
    # Execute: Run full validation cycle
    start_time = time.time()
    issues = run_all_validations()
    duration = time.time() - start_time
    
    # Assert: Completes in reasonable time
    assert duration < 60  # Should complete in <1 minute
    
    # Assert: No missed checks
    assert len(issues) >= 0  # At least ran without crashing
```

**Coverage Goals:**
- Test with 10+ business units
- Test continuous operation for 24+ hours
- Test memory usage (no leaks)
- Test alert rate limiting (avoid spam)

### Chaos Tests (Failure Scenarios)

**Test Structure:**
```python
def test_cascading_failure_handling():
    """Test handling of cascading failures."""
    
    # Setup: Simulate Twitter API outage
    simulate_api_outage("twitter")
    
    # Execute: Run validation
    issues = validate_all_business_units()
    
    # Assert: Detected Twitter dependency failure
    assert any("twitter" in i["description"].lower() for i in issues)
    
    # Assert: All dependent units reported affected
    affected_units = [i["unit_id"] for i in issues]
    assert "stantontimes" in affected_units
    
    # Execute: Simulate recovery
    restore_api("twitter")
    run_all_validations()
    
    # Assert: Units recover
    assert get_unit_health("stantontimes") == "healthy"
```

**Coverage Goals:**
- Test all known failure modes
- Test dependency failures (API outages)
- Test cascading failures (one failure causes another)
- Test recovery scenarios (automatic and manual)

---

## Monitoring Dashboard

**Location:** `/Users/zachgonser/Obsidian/VaultZap/life/areas/systems/Business Units Dashboard.md`

**Auto-updated every 5 minutes**

```markdown
# Business Units Health Dashboard

**Last Updated:** 2026-01-30 14:35:22 CST  
**Overall Status:** 🟢 All Systems Operational

---

## StantonTimes

**Status:** 🟢 Healthy  
**Last Check:** 2 minutes ago

| Metric | Current | Target | Status |
|--------|---------|--------|--------|
| Posts today | 4 | 6-8 | 🟡 On track |
| Pending approvals | 1 | <5 | 🟢 Good |
| Failed posts (24h) | 0 | 0 | 🟢 Perfect |
| Twitter API errors | 0 | 0 | 🟢 Perfect |
| Engagement rate | 1.8% | >1% | 🟢 Exceeding |

**Recent Activity:**
- 14:32 - Posted tweet (ID: 123456789)
- 14:15 - Auto-approved stuck item (age: 49h)
- 13:45 - Refreshed Twitter cookies (proactive)

---

## Bloom (Low Noise Studios)

**Status:** 🟡 Minor Issues  
**Last Check:** 1 minute ago

| Metric | Current | Target | Status |
|--------|---------|--------|--------|
| CI success rate | 92% | >95% | 🟡 Below target |
| Open PRs | 4 | <5 | 🟢 Good |
| PR review time (avg) | 38h | <48h | 🟢 Good |
| LFS quota used | 73% | <70% | 🟡 Watch |
| Unity compile errors | 0 | 0 | 🟢 Perfect |

**Recent Activity:**
- 14:34 - Retried flaky CI build (now passing)
- 14:20 - Alerted about PR #42 (needs review, 50h old)
- 13:00 - LFS cleanup reduced quota from 78% → 73%

**Active Issues:**
- 🟡 P2: CI success rate below target (investigating flaky tests)

---

## Consulting

**Status:** 🟢 Launching  
**Last Check:** 5 minutes ago

| Metric | Current | Target | Status |
|--------|---------|--------|--------|
| Leads in pipeline | 2 | >0 | 🟢 Good |
| Follow-up pending | 0 | 0 | 🟢 Perfect |
| Website uptime | 100% | >99% | 🟢 Perfect |

**Recent Activity:**
- 14:00 - New lead captured (website form)
- 12:00 - Sent follow-up email (automated)

---

## Monitor-Agent Stats

**Uptime:** 72 hours  
**Checks Run:** 8,640  
**Issues Detected:** 23  
**Auto-Healed:** 19 (83%)  
**Alerts Sent:** 4

**Self-Healing Success Rate:** 83%  
**Mean Time to Detection:** 3.2 minutes  
**Mean Time to Resolution:** 8.7 minutes

---

**Legend:**  
🟢 Healthy | 🟡 Warning | 🔴 Critical
```

---

## Success Metrics (30-Day Goals)

### Operational Metrics
- **Uptime:** >99.5% across all business units
- **MTTD:** <5 minutes (mean time to detection)
- **MTTR:** <15 minutes (mean time to resolution)
- **Auto-Heal Rate:** >90% of issues resolved without human intervention

### Business Metrics
- **StantonTimes:** 180+ tweets/month (6/day average)
- **Bloom:** >95% CI success rate, <48h PR review time
- **Revenue Protection:** Zero revenue-losing incidents

### Quality Metrics
- **False Positive Rate:** <5% (alerts that weren't real issues)
- **Alert Response Time:** 100% of P0 alerts acknowledged <5min
- **Validation Coverage:** 100% of critical workflows have validation

---

## Next Steps

1. **Immediate (This Week):**
   - [ ] Implement StantonTimes cron health validation
   - [ ] Build posting validation with retry logic
   - [ ] Set up approval queue monitoring
   - [ ] Test E2E with real StantonTimes data

2. **Week 2:**
   - [ ] Implement Bloom CI/CD health validation
   - [ ] Build PR monitoring with alerts
   - [ ] Set up LFS quota monitoring with cleanup
   - [ ] Test E2E with real Bloom repository

3. **Week 3:**
   - [ ] Build generic business unit framework
   - [ ] Create onboarding documentation
   - [ ] Implement self-healing action catalog
   - [ ] Test with mock business unit

4. **Week 4:**
   - [ ] Deploy to production (gradual rollout)
   - [ ] Monitor for false positives
   - [ ] Tune alert thresholds
   - [ ] Document learnings and iterate

---

**Built with the principle: Catch it early, fix it automatically, alert only when necessary.** ✅
