# Pharos

Pharos is a monthly outage-credit cover on GenLayer StudioNet. A customer prepays a monthly premium and specifies a target service, a covered calendar period, an incident date, and two independent public status page URLs. If both status sources confirm the incident on or after the resolve date, the agreed credit is paid to the customer and any remaining premium goes to the provider. If the outage is not confirmed, the provider retains the premium. Resolve is open from resolve_after until the day before refund_after. After refund_after, Resolve is closed. Return premium works only after resolve has recorded UNKNOWN or DISAGREE, and only on or after refund_after. A cover with verdict UNRESOLVED cannot be returned.

## Contract Details

- Chain: GenLayer StudioNet (Chain ID 61999, hex 0xf22f)
- Contract Address: `0x963F023bad934ef3A77474a445c81Ed2127b20C6`
- Explorer: [https://explorer-studio.genlayer.com/address/0x963F023bad934ef3A77474a445c81Ed2127b20C6](https://explorer-studio.genlayer.com/address/0x963F023bad934ef3A77474a445c81Ed2127b20C6)

## Methods

- `buy_cover(provider, service, period_start, period_end, incident_date, resolve_after, credit, status_url_a, status_url_b)`: Creates and funds an outage cover with the attached premium value.
- `resolve(policy_id)` / `resolve(cover_id)`: Adjudicates the incident against dual public status URLs. Resolve is open from `resolve_after` until the day before `refund_after`. After `refund_after`, Resolve is closed.
- `timeout_refund(policy_id)` / `timeout_refund(cover_id)` : Return premium works only after resolve has recorded `UNKNOWN` or `DISAGREE`, and only on or after `refund_after`. A cover with verdict `UNRESOLVED` cannot be returned.
- `get_policy(policy_id)` / `get_cover(cover_id)`: Returns stored cover details including parties, dates, amounts, status, verdict, and funds disposition.
- `can_resolve(policy_id)` / `can_resolve(cover_id)`: Returns whether resolution (`allowed`) and timeout refund (`timeout_refund_allowed`) are permitted at current UTC time.
- `get_policy_count()` / `get_cover_count()`: Returns the total number of covers created.
- `get_reserved_premiums()` : Returns the total reserved premium balance currently held in active covers.

## Live cover

- buy_cover `0x7037e79ba3507ed0d9cb354722092033e2e49c112f25bb95ef773585749ab432`
- resolve `0x380ac79efea47fc36d0df8e951f09a4169871651ceb1936d4dc67109f8efef8f`
- timeout_refund: after 2026-10-08 UTC, only if the verdict is UNKNOWN or DISAGREE

## Operations

1. **Buy Cover**: Connect wallet on the floor view, input provider address, service name (minimum 12 characters), valid period dates, incident date, resolve after date, credit in GEN, premium in GEN, and two HTTPS allowlisted status URLs from different hostnames.
2. **Resolve Cover**: Provide cover ID. Resolve is open from `resolve_after` until the day before `refund_after`. After `refund_after`, Resolve is closed. Do not offer both actions as if they can race.
3. **Return Premium**: Return premium works only after resolve has recorded UNKNOWN or DISAGREE, and only on or after `refund_after`. A cover with verdict UNRESOLVED cannot be returned. Helper under Return premium: "Opens the UTC day after resolve_after, and only after Resolve has recorded UNKNOWN or DISAGREE."
4. **Lookup Cover**: Enter cover ID in the lookup panel to retrieve the complete on-chain outage slip, verdict, and disposition state. Lookup must show verdict. If it is UNRESOLVED, say return is closed.
