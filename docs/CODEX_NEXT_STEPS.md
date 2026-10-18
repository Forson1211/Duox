# Maintaining DUO CLASH

Read README.md, docs/architecture.md, docs/api.md, and docs/deployment.md. Run npm run check and npm run test:browser before release. Preserve server-owned scoring/deadlines, atomic results/rewards, private serializers, and role checks. Do not connect tests to production data.

Outstanding release work concerns external hosting, Atlas/SMTP configuration, backup/retention policy, and production capacity validation. Extend the shared round engine for future games rather than adding client-trusted scoring systems.
