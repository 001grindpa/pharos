# Pharos

Pharos is a monthly outage-credit cover on GenLayer StudioNet. A customer prepays a monthly premium and specifies a target service, a covered calendar period, an incident date, and two independent public status page URLs. If both status sources confirm the incident on or after the resolve date, the agreed credit is paid to the customer and any remaining premium goes to the provider. If the outage is not confirmed, the provider retains the premium. If adjudication cannot reach consensus, the cover remains active, and a timeout refund opens the day after the resolve date to return the full premium to the customer.

## Contract Details

- Chain: GenLayer StudioNet (Chain ID 61999, hex 0xf22f)
- Contract Address: `0xDEd88EaA439d726e40570cD92C8A4dfD21119312`
- Explorer: [https://explorer-studio.genlayer.com/address/0xDEd88EaA439d726e40570cD92C8A4dfD21119312](https://explorer-studio.genlayer.com/address/0xDEd88EaA439d726e40570cD92C8A4dfD21119312)

## Methods

- `buy_cover(provider, service, period_start, period_end, incident_date, resolve_after, credit, status_url_a, status_url_b)`: Creates and funds an outage cover with the attached premium value.
- `resolve(cover_id)`: Adjudicates the incident against the dual public status URLs on or after `resolve_after`.
- `timeout_refund(cover_id)`: Returns the reserved premium to the customer on or after `refund_after` (which is stored as `resolve_after` plus one UTC day) if the cover is still active.
- `get_cover(cover_id)` / `get_policy(policy_id)`: Returns stored cover details including parties, dates, amounts, status, verdict, and funds disposition.
- `can_resolve(cover_id)`: Returns whether resolution and timeout refund are permitted at the current UTC time.
- `get_cover_count()` / `get_policy_count()`: Returns the total number of covers created.
- `get_reserved_premiums()`: Returns the total reserved premium balance currently held in active covers.

## Live cover

- buy_cover `0xb2370a0d6cf80439d02a17cdacf3d72907c2c859b449c58e3a1852cb0f326c06`
- timeout_refund `0x9ea2d46fa34c45cab0b1dc62c72b5778611f5070a7a1d6c3f73b270b20b60d2e`
- expected `REFUNDED` / `TIMEOUT` / `PREMIUM_RETURNED_TO_CUSTOMER`

## Operations

1. **Buy Cover**: Connect wallet on the floor view, input provider address, service name (minimum 12 characters), valid period dates, incident date, resolve after date, credit in GEN, premium in GEN, and two HTTPS allowlisted status URLs from different hostnames.
2. **Resolve Cover**: Provide cover ID on or after `resolve_after` date to trigger multi-source validator adjudication.
3. **Return Premium**: Execute timeout refund on or after the day following `resolve_after` if the cover remains active without conclusive settlement.
4. **Lookup Cover**: Enter cover ID in the lookup panel to retrieve the complete on-chain outage slip and disposition state.
