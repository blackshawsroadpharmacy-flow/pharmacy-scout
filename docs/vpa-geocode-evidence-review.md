# VPA geocode evidence review

Geocode evidence is append-only for normal authenticated clients.

1. Insert a provider result with its query, returned address, provider result
   identifier, coordinates, precision and validation state.
2. An administrator may approve evidence at insertion only after confirming the
   same canonical premises, Victorian bounds, postcode/suburb agreement and
   address-level precision.
3. Rejected or quarantined evidence remains historical and cannot support a
   `validated` premises state.
4. A correction is a new evidence row. Set `supersedes_result_id` to the prior
   row; do not rewrite or delete the prior provider result.
5. The deferred database invariant permits evidence and canonical status to be
   written in either order in one transaction, but commits only when approved
   same-premises evidence agrees with retained coordinates within 25 metres.

Bulk geocoding remains prohibited until the provider, licence, caching rights,
cost and operational limits are approved separately.
