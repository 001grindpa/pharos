# Pharos

Pharos is a monthly outage-credit cover on GenLayer StudioNet. A customer prepays a monthly premium and specifies a target service, a covered calendar period, an incident date, and two independent public status page URLs. Confirmed outages pay the agreed credit to the customer, a NO verdict lets the provider retain the premium, and inconclusive results can recover the premium. Resolve is open from `resolve_after` until the day before `refund_after`. Return premium opens on `refund_after`. UNKNOWN or DISAGREE returns as TIMEOUT; an unresolved cover after `refund_after` returns as EXPIRED. Once a cover is REFUNDED, CREDITED, or RETAINED, both actions are closed.

## Contract Details

- Chain: GenLayer StudioNet (Chain ID 61999, hex 0xf22f)
- Contract Address: `0xADa56B1D824D71ACf22301086c2DEDae52ea74cD`
- Explorer: [https://explorer-studio.genlayer.com/address/0xADa56B1D824D71ACf22301086c2DEDae52ea74cD](https://explorer-studio.genlayer.com/address/0xADa56B1D824D71ACf22301086c2DEDae52ea74cD)

## Methods

- `buy_cover(provider, service, period_start, period_end, incident_date, resolve_after, credit, status_url_a, status_url_b)`: Creates and funds an outage cover with the attached premium value.
- `resolve(policy_id)`: Adjudicates the incident against dual public status URLs. Resolve is open from `resolve_after` until the day before `refund_after`.
- `timeout_refund(policy_id)`: On or after `refund_after`, returns an unresolved cover as `EXPIRED`, or a cover with verdict `UNKNOWN` / `DISAGREE` as `TIMEOUT`.
- `get_policy(policy_id)`: Returns stored cover details including parties, dates, amounts, status, verdict, and funds disposition. The frontend retains a `get_cover` lookup fallback for older deployments.
- `can_resolve(policy_id)`: Returns whether resolution (`allowed`) and timeout refund (`timeout_refund_allowed`) are permitted at current UTC time.
- `get_policy_count()`: Returns the total number of covers created.
- `get_reserved_premiums()` : Returns the total reserved premium balance currently held in active covers.

## Current deployment transactions

### Cover A

- Buy: `0x9055ff977bf3180cdd2cac96392eaadc46b86b5abb855a1ad2246cf1ba781552`
- Return: `0x1ab19c44c6ae83c161c870f69a5eb7f58aa90071bc02f823c62552694337df1b`
- Result: `REFUNDED` / `EXPIRED` / `PREMIUM_RETURNED_TO_CUSTOMER`

### Cover B

- Buy: `0x375d11a5842e6559f189d4aff6f89735c936664dc692d1ede78c37f656254c90`
- Resolve: `0xb6e5a0dd7e771a10767db6fc7de7db1a3bccb1268f1f5b7c9193561e4be1b81f`
- Result: `ACTIVE` / `UNKNOWN` or `DISAGREE`; return premium is locked until `2026-10-10` UTC.

## Operations

1. **Buy Cover**: Connect wallet on the floor view, input provider address, service name (minimum 12 characters), valid period dates, incident date, resolve after date, credit in GEN, premium in GEN, and two HTTPS allowlisted status URLs from different hostnames.
2. **Resolve Cover**: Provide cover ID. Resolve is open from `resolve_after` through the day before `refund_after`; after that, Resolve is closed.
3. **Return Premium**: Opens on `refund_after`. UNKNOWN or DISAGREE returns as `TIMEOUT`; an unresolved cover returns as `EXPIRED`. Helper under Return premium: "Opens the UTC day after resolve_after. An unresolved cover can be recovered then. Resolve is closed."
4. **Lookup Cover**: Enter cover ID in the lookup panel to retrieve the complete on-chain outage slip, verdict, and disposition state. Returned covers show `REFUNDED` with verdict `EXPIRED` or `TIMEOUT`. Both buttons stay closed after `REFUNDED`, `CREDITED`, or `RETAINED`.
