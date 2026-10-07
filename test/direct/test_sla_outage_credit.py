CONTRACT = "src/Ninesbond.py"

STATUS_A = "https://www.githubstatus.com/"
STATUS_B = "https://status.cloudflare.com/"


def _buy(contract, direct_vm, customer, provider, resolve_after="2026-12-31", credit=10**18):
    direct_vm.sender = customer
    return contract.buy_cover(
        str(provider),
        "GitHub Actions API",
        "2026-09-01",
        "2026-09-30",
        "2026-09-15",
        resolve_after,
        credit,
        STATUS_A,
        STATUS_B,
        value=10**18,
    )


def test_customer_cannot_be_provider(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy(CONTRACT)
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("customer and provider must be different"):
        contract.buy_cover(
            str(direct_alice),
            "GitHub Actions API",
            "2026-09-01",
            "2026-09-30",
            "2026-09-15",
            "2026-12-31",
            10**18,
            STATUS_A,
            STATUS_B,
            value=10**18,
        )


def test_sources_must_differ(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy(CONTRACT)
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("sources must come from two different hosts"):
        contract.buy_cover(
            str(direct_bob),
            "GitHub Actions API",
            "2026-09-01",
            "2026-09-30",
            "2026-09-15",
            "2026-12-31",
            10**18,
            STATUS_A,
            "https://www.githubstatus.com/incidents/1",
            value=10**18,
        )


def test_credit_cannot_exceed_premium(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy(CONTRACT)
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("credit must be greater than zero and not exceed premium"):
        contract.buy_cover(
            str(direct_bob),
            "GitHub Actions API",
            "2026-09-01",
            "2026-09-30",
            "2026-09-15",
            "2026-12-31",
            2 * 10**18,
            STATUS_A,
            STATUS_B,
            value=10**18,
        )


def test_incident_must_sit_in_period(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy(CONTRACT)
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("incident_date must fall inside the covered period"):
        contract.buy_cover(
            str(direct_bob),
            "GitHub Actions API",
            "2026-09-01",
            "2026-09-30",
            "2026-10-15",
            "2026-12-31",
            10**18,
            STATUS_A,
            STATUS_B,
            value=10**18,
        )


def test_rejects_impossible_calendar_dates(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = direct_deploy(CONTRACT)
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("incident_date must be a real calendar date"):
        contract.buy_cover(
            str(direct_bob),
            "GitHub Actions API",
            "2026-09-01",
            "2026-09-30",
            "2026-02-31",
            "2026-12-31",
            10**18,
            STATUS_A,
            STATUS_B,
            value=10**18,
        )
    with direct_vm.expect_revert("period_end must be a real calendar date"):
        contract.buy_cover(
            str(direct_bob),
            "GitHub Actions API",
            "2026-09-01",
            "2026-13-01",
            "2026-09-15",
            "2026-12-31",
            10**18,
            STATUS_A,
            STATUS_B,
            value=10**18,
        )


def test_early_resolve_and_timeout_blocked(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    contract = direct_deploy(CONTRACT)
    policy_id = _buy(contract, direct_vm, direct_alice, direct_bob)
    raw = contract.get_policy(policy_id)
    assert "ACTIVE" in raw
    assert "RESERVED" in raw
    assert "2027-01-01" in raw

    with direct_vm.expect_revert("policy cannot be closed before resolve_after"):
        contract.resolve(policy_id)
    with direct_vm.expect_revert("timeout_refund requires a recorded UNKNOWN or DISAGREE"):
        contract.timeout_refund(policy_id)

    after = contract.get_policy(policy_id)
    assert "ACTIVE" in after
    assert "UNRESOLVED" in after
    status = contract.can_resolve(policy_id).replace(" ", "")
    assert '"allowed":false' in status
    assert '"timeout_refund_allowed":false' in status


def test_timeout_without_adjudication_does_not_pay(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    contract = direct_deploy(CONTRACT)
    policy_id = _buy(
        contract, direct_vm, direct_alice, direct_bob, resolve_after="2020-01-01"
    )
    with direct_vm.expect_revert("timeout_refund requires a recorded UNKNOWN or DISAGREE"):
        contract.timeout_refund(policy_id)
    after = contract.get_policy(policy_id)
    assert "ACTIVE" in after
    assert "UNRESOLVED" in after
    assert contract.get_reserved_premiums() == str(10**18)


def test_resolve_closed_after_refund_deadline(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    contract = direct_deploy(CONTRACT)
    policy_id = _buy(
        contract, direct_vm, direct_alice, direct_bob, resolve_after="2020-01-01"
    )
    with direct_vm.expect_revert("resolve is closed"):
        contract.resolve(policy_id)
    after = contract.get_policy(policy_id)
    assert "ACTIVE" in after
    assert "UNRESOLVED" in after
    assert "CREDITED" not in after
    assert "REFUNDED" not in after


def test_unknown_records_then_refund_stays_closed_until_next_day(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    contract = direct_deploy(CONTRACT)
    direct_vm.sender = direct_alice
    policy_id = contract.buy_cover(
        str(direct_bob),
        "GitHub Actions API",
        "2026-10-01",
        "2026-10-31",
        "2026-10-07",
        "2026-10-07",
        10**18,
        STATUS_A,
        STATUS_B,
        value=10**18,
    )
    raw = contract.get_policy(policy_id)
    assert "2026-10-07" in raw
    assert "2026-10-08" in raw

    def unknown(_policy):
        return {"verdict": "UNKNOWN"}

    contract._adjudicate = unknown
    contract.resolve(policy_id)
    after = contract.get_policy(policy_id)
    assert "ACTIVE" in after
    assert "UNKNOWN" in after
    assert "RESERVED" in after

    with direct_vm.expect_revert("timeout_refund cannot run before refund_after"):
        contract.timeout_refund(policy_id)
    status = contract.can_resolve(policy_id).replace(" ", "")
    assert '"allowed":false' in status or '"allowed":true' in status
    assert '"timeout_refund_allowed":false' in status
    assert "ACTIVE" in contract.get_policy(policy_id)


def test_unknown_does_not_pay_or_keep(
    direct_vm, direct_deploy, direct_alice, direct_bob
):
    contract = direct_deploy(CONTRACT)
    direct_vm.sender = direct_alice
    policy_id = contract.buy_cover(
        str(direct_bob),
        "GitHub Actions API",
        "2026-10-01",
        "2026-10-31",
        "2026-10-07",
        "2026-10-07",
        10**18,
        STATUS_A,
        STATUS_B,
        value=10**18,
    )

    def unknown(_policy):
        return {"verdict": "UNKNOWN"}

    contract._adjudicate = unknown
    status = contract.resolve(policy_id)
    after = contract.get_policy(policy_id)
    assert "ACTIVE" in after
    assert "UNKNOWN" in after
    assert "CREDITED" not in str(status)
    assert "PREMIUM_KEPT_BY_PROVIDER" not in after
    assert "RESERVED" in after
    assert contract.get_reserved_premiums() == str(10**18)