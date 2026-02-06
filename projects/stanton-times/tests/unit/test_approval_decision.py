from datetime import timedelta

from src.utils.approval_decision import APPROVAL_REACTIONS, decide_draft_status


def test_decide_draft_status_auto_reject_on_age():
    status = decide_draft_status(
        reaction_counts={APPROVAL_REACTIONS["approve"]: 10},
        message_age=timedelta(hours=25),
        max_age=timedelta(hours=24),
    )
    assert status == "rejected"


def test_decide_draft_status_edit_wins_ties():
    status = decide_draft_status(
        reaction_counts={
            APPROVAL_REACTIONS["edit"]: 2,
            APPROVAL_REACTIONS["approve"]: 2,
            APPROVAL_REACTIONS["reject"]: 2,
        },
        message_age=timedelta(minutes=5),
        max_age=timedelta(hours=24),
    )
    assert status == "edit_requested"


def test_decide_draft_status_approve_wins():
    status = decide_draft_status(
        reaction_counts={
            APPROVAL_REACTIONS["approve"]: 3,
            APPROVAL_REACTIONS["reject"]: 1,
            APPROVAL_REACTIONS["hold"]: 2,
        },
        message_age=timedelta(minutes=5),
        max_age=timedelta(hours=24),
    )
    assert status == "approved"


def test_decide_draft_status_reject_wins_tie_over_approve():
    status = decide_draft_status(
        reaction_counts={
            APPROVAL_REACTIONS["approve"]: 1,
            APPROVAL_REACTIONS["reject"]: 1,
        },
        message_age=timedelta(minutes=5),
        max_age=timedelta(hours=24),
    )
    assert status == "rejected"


def test_decide_draft_status_hold_wins():
    status = decide_draft_status(
        reaction_counts={
            APPROVAL_REACTIONS["hold"]: 2,
            APPROVAL_REACTIONS["approve"]: 1,
        },
        message_age=timedelta(minutes=5),
        max_age=timedelta(hours=24),
    )
    assert status == "hold"


def test_decide_draft_status_none_when_no_clear_signal():
    status = decide_draft_status(
        reaction_counts={},
        message_age=timedelta(minutes=5),
        max_age=timedelta(hours=24),
    )
    assert status is None

