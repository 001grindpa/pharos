# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

import json
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from urllib.parse import urlparse

from genlayer import *


HTTPS = "https://"
MAX_PAGE_CHARS = 12000
MIN_TEXT_CHARS = 12
REFUND_GRACE_DAYS = 1
ZERO = Address("0x0000000000000000000000000000000000000000")

ALLOWED_HOSTS = (
    "statuspage.io",
    "www.statuspage.io",
    "status.cloudflare.com",
    "www.cloudflarestatus.com",
    "cloudflarestatus.com",
    "status.aws.amazon.com",
    "health.aws.amazon.com",
    "aws.amazon.com",
    "status.github.com",
    "www.githubstatus.com",
    "githubstatus.com",
    "status.stripe.com",
    "stripe.com",
    "status.openai.com",
    "status.hashicorp.com",
    "status.digitalocean.com",
    "status.gitlab.com",
    "status.heroku.com",
    "status.vercel.com",
    "status.slack.com",
    "status.twilio.com",
    "status.sendgrid.com",
    "status.datadoghq.com",
    "status.mongodb.com",
    "status.redis.com",
    "status.snowflake.com",
    "status.auth0.com",
    "status.okta.com",
    "status.notion.so",
    "www.isitdownrightnow.com",
    "downdetector.com",
    "www.downdetector.com",
    "bbc.com",
    "www.bbc.com",
    "reuters.com",
    "www.reuters.com",
    "apnews.com",
    "www.apnews.com",
    "theverge.com",
    "www.theverge.com",
    "techcrunch.com",
    "www.techcrunch.com",
    "github.com",
    "www.github.com",
    "gitlab.com",
    "www.gitlab.com",
)


def _host(url: str) -> str:
    return (urlparse(url).hostname or "").lower()


def _host_allowed(url: str) -> bool:
    host = _host(url)
    if not host:
        return False
    for allowed in ALLOWED_HOSTS:
        base = allowed[4:] if allowed.startswith("www.") else allowed
        if host == allowed or host == base or host.endswith("." + base):
            return True
    return False


def _require_https_url(url: str, label: str) -> str:
    cleaned = url.strip()
    if not cleaned.lower().startswith(HTTPS):
        raise gl.vm.UserError(f"{label} must be an https url")
    if not _host_allowed(cleaned):
        raise gl.vm.UserError(f"{label} host is not on the source allowlist")
    return cleaned


def _require_date(value: str, label: str) -> str:
    cleaned = value.strip()
    try:
        datetime.strptime(cleaned, "%Y-%m-%d")
    except ValueError:
        raise gl.vm.UserError(label + " must be a real calendar date YYYY-MM-DD")
    return cleaned


def _add_days(day: str, days: int) -> str:
    return (datetime.strptime(day, "%Y-%m-%d") + timedelta(days=days)).strftime("%Y-%m-%d")


def _today_utc() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


@gl.evm.contract_interface
class _Wallet:
    class View:
        pass

    class Write:
        pass


def _pay(to: Address, amount: u256) -> None:
    if amount == 0:
        return
    if to == ZERO:
        raise gl.vm.UserError("cannot pay the zero address")
    _Wallet(to).emit_transfer(value=amount)


@allow_storage
@dataclass
class Policy:
    customer: Address
    provider: Address
    service: str
    period_start: str
    period_end: str
    incident_date: str
    resolve_after: str
    refund_after: str
    status_url_a: str
    status_url_b: str
    premium: u256
    credit: u256
    reserved: u256
    status: str
    verdict: str
    funds_disposition: str


class SlaOutageCredit(gl.Contract):
    policies: TreeMap[str, Policy]
    next_policy_id: u256
    reserved_premiums: u256

    def __init__(self):
        self.next_policy_id = u256(1)
        self.reserved_premiums = u256(0)

    def _id(self) -> str:
        return str(int(self.next_policy_id))

    def _get(self, policy_id: str) -> Policy:
        if policy_id not in self.policies:
            raise gl.vm.UserError("policy not found")
        return self.policies[policy_id]

    def _ensure_resolvable(self, policy: Policy) -> None:
        today = _today_utc()
        if today < policy.resolve_after:
            raise gl.vm.UserError(
                "policy cannot be closed before resolve_after " + policy.resolve_after
            )
        if today >= policy.refund_after:
            raise gl.vm.UserError(
                "resolve is closed; use timeout_refund after a recorded disagreement"
            )

    def _ensure_refundable(self, policy: Policy) -> None:
        today = _today_utc()
        if today < policy.refund_after:
            raise gl.vm.UserError(
                "timeout_refund cannot run before refund_after " + policy.refund_after
            )
        if policy.verdict in ("UNKNOWN", "DISAGREE", "UNRESOLVED"):
            return
        raise gl.vm.UserError("timeout_refund requires an unresolved or inconclusive cover")

    def _extract_page(
        self, url: str, service: str, incident_date: str, period_start: str, period_end: str
    ) -> dict:
        failed = {"date_match": False, "related": False, "incident": False, "answer": "UNKNOWN"}
        try:
            raw = gl.nondet.web.render(url, mode="text")
            page_text = raw if isinstance(raw, str) else str(raw)
            page_text = page_text[:MAX_PAGE_CHARS]
        except Exception:
            return failed

        prompt = f"""
Decide whether one public status or post-mortem page shows an outage for a named service on a calendar day.

Service: {service}
Incident date (YYYY-MM-DD): {incident_date}
Covered period: {period_start} to {period_end}
Source URL: {url}

Page text:
{page_text}

Return JSON only:
{{
  "date_match": true or false,
  "related": true or false,
  "incident": true or false,
  "answer": "YES" or "NO" or "UNKNOWN"
}}
Rules:
- related is true only if the page is about this service or its official status.
- date_match is true only if the page discusses that calendar day.
- incident is true only if the page shows an outage, degradation, or incident on that day.
- answer is YES only if related and date_match and incident.
- answer is NO if the page is related and dated and clearly shows no incident that day.
- UNKNOWN if incomplete, off-topic, undated, or inconclusive.
"""
        try:
            parsed = gl.nondet.exec_prompt(prompt, response_format="json")
            if isinstance(parsed, str):
                parsed = json.loads(parsed)
        except Exception:
            return failed

        date_match = bool(parsed.get("date_match", False))
        related = bool(parsed.get("related", False))
        incident = bool(parsed.get("incident", False))
        answer = str(parsed.get("answer", "UNKNOWN")).upper()
        if answer not in ("YES", "NO", "UNKNOWN"):
            answer = "UNKNOWN"
        if not date_match or not related:
            answer = "UNKNOWN"
            incident = False
        if answer == "YES" and not incident:
            answer = "UNKNOWN"
        return {
            "date_match": date_match,
            "related": related,
            "incident": incident,
            "answer": answer,
        }

    def _decision(self, policy: Policy) -> dict:
        try:
            page_a = self._extract_page(
                policy.status_url_a,
                policy.service,
                policy.incident_date,
                policy.period_start,
                policy.period_end,
            )
            page_b = self._extract_page(
                policy.status_url_b,
                policy.service,
                policy.incident_date,
                policy.period_start,
                policy.period_end,
            )
        except Exception:
            return {"verdict": "UNKNOWN"}

        if (
            page_a["answer"] == "UNKNOWN"
            or page_b["answer"] == "UNKNOWN"
            or not page_a["date_match"]
            or not page_b["date_match"]
            or not page_a["related"]
            or not page_b["related"]
        ):
            verdict = "UNKNOWN"
        elif page_a["answer"] != page_b["answer"]:
            verdict = "DISAGREE"
        else:
            verdict = page_a["answer"]
        return {"verdict": verdict}

    def _adjudicate(self, policy: Policy) -> dict:
        def leader_fn() -> str:
            return json.dumps(self._decision(policy), sort_keys=True, separators=(",", ":"))

        def validator_fn(leader_result) -> bool:
            payload = leader_result
            if hasattr(leader_result, "calldata"):
                payload = leader_result.calldata
            if isinstance(payload, (bytes, bytearray)):
                payload = payload.decode("utf-8", errors="replace")
            if not isinstance(payload, str):
                payload = str(payload)
            try:
                leader = json.loads(payload)
            except Exception:
                return False
            own = self._decision(policy)
            return own.get("verdict") == str(leader.get("verdict", "")).upper()

        try:
            raw = gl.vm.run_nondet_unsafe(leader_fn, validator_fn)
        except Exception:
            return {"verdict": "UNKNOWN"}
        try:
            if isinstance(raw, str):
                return json.loads(raw)
            if hasattr(raw, "calldata"):
                data = raw.calldata
                return json.loads(data if isinstance(data, str) else str(data))
            return json.loads(str(raw))
        except Exception:
            return {"verdict": "UNKNOWN"}

    @gl.public.write.payable
    def buy_cover(
        self,
        provider: str,
        service: str,
        period_start: str,
        period_end: str,
        incident_date: str,
        resolve_after: str,
        credit: u256,
        status_url_a: str,
        status_url_b: str,
    ) -> str:
        if len(service.strip()) < MIN_TEXT_CHARS:
            raise gl.vm.UserError("service name is too short")
        period_start = _require_date(period_start, "period_start")
        period_end = _require_date(period_end, "period_end")
        incident_date = _require_date(incident_date, "incident_date")
        resolve_after = _require_date(resolve_after, "resolve_after")
        if period_end < period_start:
            raise gl.vm.UserError("period_end must be on or after period_start")
        if incident_date < period_start or incident_date > period_end:
            raise gl.vm.UserError("incident_date must fall inside the covered period")
        if resolve_after < incident_date:
            raise gl.vm.UserError("resolve_after must be on or after incident_date")
        refund_after = _add_days(resolve_after, REFUND_GRACE_DAYS)

        provider_addr = Address(provider)
        if provider_addr == ZERO:
            raise gl.vm.UserError("provider is required")
        if provider_addr == gl.message.sender_address:
            raise gl.vm.UserError("customer and provider must be different")

        premium = gl.message.value
        if premium == u256(0):
            raise gl.vm.UserError("monthly premium must be greater than zero")
        if credit == u256(0) or credit > premium:
            raise gl.vm.UserError("credit must be greater than zero and not exceed premium")

        url_a = _require_https_url(status_url_a, "status_url_a")
        url_b = _require_https_url(status_url_b, "status_url_b")
        if _host(url_a) == _host(url_b):
            raise gl.vm.UserError("sources must come from two different hosts")

        policy_id = self._id()
        self.policies[policy_id] = Policy(
            customer=gl.message.sender_address,
            provider=provider_addr,
            service=service.strip(),
            period_start=period_start,
            period_end=period_end,
            incident_date=incident_date,
            resolve_after=resolve_after,
            refund_after=refund_after,
            status_url_a=url_a,
            status_url_b=url_b,
            premium=premium,
            credit=credit,
            reserved=premium,
            status="ACTIVE",
            verdict="UNRESOLVED",
            funds_disposition="RESERVED",
        )
        self.next_policy_id = self.next_policy_id + u256(1)
        self.reserved_premiums = self.reserved_premiums + premium
        return policy_id

    @gl.public.write
    def resolve(self, policy_id: str) -> str:
        policy = self._get(policy_id)
        if policy.status != "ACTIVE":
            raise gl.vm.UserError("policy is not active")
        self._ensure_resolvable(policy)

        result = self._adjudicate(policy)
        verdict = str(result.get("verdict", "UNKNOWN")).upper()
        premium = policy.premium
        credit = policy.credit
        leftover = premium - credit

        if verdict == "YES":
            policy.status = "CREDITED"
            policy.verdict = "YES"
            policy.reserved = u256(0)
            policy.funds_disposition = "CREDIT_PAID_TO_CUSTOMER"
            self.reserved_premiums = self.reserved_premiums - premium
            self.policies[policy_id] = policy
            _pay(policy.customer, credit)
            if leftover > u256(0):
                _pay(policy.provider, leftover)
        elif verdict == "NO":
            policy.status = "RETAINED"
            policy.verdict = "NO"
            policy.reserved = u256(0)
            policy.funds_disposition = "PREMIUM_KEPT_BY_PROVIDER"
            self.reserved_premiums = self.reserved_premiums - premium
            self.policies[policy_id] = policy
            _pay(policy.provider, premium)
        else:
            policy.verdict = verdict if verdict in ("UNKNOWN", "DISAGREE") else "UNKNOWN"
            self.policies[policy_id] = policy
        return self.policies[policy_id].status

    @gl.public.write
    def timeout_refund(self, policy_id: str) -> None:
        policy = self._get(policy_id)
        if policy.status != "ACTIVE":
            raise gl.vm.UserError("only an active policy can be timeout-refunded")
        self._ensure_refundable(policy)
        premium = policy.premium
        customer = policy.customer
        expired = policy.verdict == "UNRESOLVED"
        policy.status = "REFUNDED"
        policy.verdict = "EXPIRED" if expired else "TIMEOUT"
        policy.reserved = u256(0)
        policy.funds_disposition = "PREMIUM_RETURNED_TO_CUSTOMER"
        self.reserved_premiums = self.reserved_premiums - premium
        self.policies[policy_id] = policy
        _pay(customer, premium)

    @gl.public.view
    def can_resolve(self, policy_id: str) -> str:
        policy = self._get(policy_id)
        today = _today_utc()
        active = policy.status == "ACTIVE"
        recoverable = policy.verdict in ("UNKNOWN", "DISAGREE", "UNRESOLVED")
        return json.dumps(
            {
                "status": policy.status,
                "incident_date": policy.incident_date,
                "resolve_after": policy.resolve_after,
                "refund_after": policy.refund_after,
                "verdict": policy.verdict,
                "now_utc": today,
                "allowed": active and today >= policy.resolve_after and today < policy.refund_after,
                "timeout_refund_allowed": active and recoverable and today >= policy.refund_after,
            },
            sort_keys=True,
        )

    @gl.public.view
    def get_policy(self, policy_id: str) -> str:
        policy = self._get(policy_id)
        return json.dumps(
            {
                "customer": policy.customer.as_hex,
                "provider": policy.provider.as_hex,
                "service": policy.service,
                "period_start": policy.period_start,
                "period_end": policy.period_end,
                "incident_date": policy.incident_date,
                "resolve_after": policy.resolve_after,
                "refund_after": policy.refund_after,
                "status_url_a": policy.status_url_a,
                "status_url_b": policy.status_url_b,
                "premium": str(int(policy.premium)),
                "credit": str(int(policy.credit)),
                "reserved": str(int(policy.reserved)),
                "status": policy.status,
                "verdict": policy.verdict,
                "funds_disposition": policy.funds_disposition,
            },
            sort_keys=True,
        )

    @gl.public.view
    def get_policy_count(self) -> str:
        return str(int(self.next_policy_id) - 1)

    @gl.public.view
    def get_reserved_premiums(self) -> str:
        return str(int(self.reserved_premiums))