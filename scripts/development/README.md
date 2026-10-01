# Development inventory transition

Back up the development database before running this transition. Stop API writes during cleanup and migration.

1. Run `cleanup-test-orders.sql` against the explicitly selected development database with `PGOPTIONS='-c app.allow_test_order_cleanup=true'` and `psql -v ON_ERROR_STOP=1`. It removes PENDING/PAID test orders and their billing, product and movement rows. It stops if a retained order references one of them. Clients and completed/cancelled orders remain untouched.
2. Run `pnpm exec drizzle-kit migrate` with the development `DATABASE_URL`. Migration 0020 adds Supplier Order and Inventory, preserving old purchase lines and tracking. Existing supplier records require a single importing user; the migration refuses to guess between multiple users.
3. Migration 0021 replaces AVAILABLE with the former stock value (negative values become zero), without movements. Migration 0022 drops the old column. The transition does not reconstruct reservations for deleted test orders.

The cleanup script is deliberately outside Drizzle migrations and must never be included in production startup.

# First production deployment

Before the first deployment, archive the development SQL migrations and their complete `meta` directory outside the configured Drizzle output directory. Keep that archive in Git for reference. Generate a new initial migration from the final schema with `drizzle-kit generate`, review it and verify it on an empty database. Then run `drizzle-kit migrate` on the empty production database and load the separately maintained seed.

Do not mix archived migrations with the new baseline or apply that baseline to an existing development database. Recreate development databases if switching them to the baseline. After production starts, preserve the baseline and use incremental migrations. Generating migrations belongs in development; Docker startup applies already reviewed migrations.

The seed's future JSON inventory loading remains separate work. Its product mapping only stops forwarding the removed stock field.
