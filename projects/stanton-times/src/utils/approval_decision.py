from __future__ import annotations

from datetime import timedelta
from typing import Mapping, Optional


# Emoji set used by the Discord approval workflow.
APPROVAL_REACTIONS = {
    "approve": "✅",
    "reject": "❌",
    "hold": "🤔",
    "edit": "✏️",
}


def decide_draft_status(
    *,
    reaction_counts: Mapping[str, int],
    message_age: timedelta,
    max_age: timedelta,
) -> Optional[str]:
    """
    Determine the next draft_status based on reaction counts and message age.

    Returns:
      - One of: approved, rejected, hold, edit_requested
      - None if no status change should be applied
    """
    if message_age > max_age:
        return "rejected"

    approve = int(reaction_counts.get(APPROVAL_REACTIONS["approve"], 0) or 0)
    reject = int(reaction_counts.get(APPROVAL_REACTIONS["reject"], 0) or 0)
    hold = int(reaction_counts.get(APPROVAL_REACTIONS["hold"], 0) or 0)
    edit = int(reaction_counts.get(APPROVAL_REACTIONS["edit"], 0) or 0)

    # Mirror reaction_monitor.py precedence rules.
    if edit > 0 and edit >= max(approve, reject, hold):
        return "edit_requested"
    if approve > max(reject, hold, edit):
        return "approved"
    if reject >= max(approve, hold, edit) and reject > 0:
        return "rejected"
    if hold > max(approve, reject, edit):
        return "hold"

    return None

