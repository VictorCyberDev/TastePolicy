# Isolated Neon recovery rehearsal

Observed through the authorized Neon account on 2026-10-28; this is a current-data clone/migration rehearsal, not point-in-time disaster recovery or an RTO/RPO claim.

Project holy-heart-68306654, production branch br-little-king-za6unmfo (tastepolicy_production) was cloned into br-polished-dream-zagn7kg1, tastepolicy-recovery-drill-20261028, parent LSN 0/299FEE8. Production and clone initially had identical checksums for migrations 0001–0011. Migration 0012 and its ledger checksum were applied to the clone; its ledger then contained twelve entries. Production was rechecked at eleven entries before the later PR #18 production release. No production connection binding, secret, application host or data was changed by the drill.

The test endpoint ep-misty-bonus-zag0syt5 used 0.25 CU and was explicitly suspended after the rehearsal. Its branch was retained as recovery evidence. The original preview branch br-shiny-fire-zaga6tg6 was untouched. Endpoint status and retained branch contents should be refreshed before any future use; this record is historical evidence.

Account inspection exposed a 21,600-second history retention setting; the production child branch had no snapshot schedule. Requesting a production-child snapshot returned "not allowed to snapshot non-root branch". Requesting a sixty-second auto-suspend override returned "modifying the suspend interval is not permitted on this account". The workaround was an isolated clone with the account-default endpoint settings, followed by explicit suspension. No plan upgrade or purchase occurred.

Remaining acceptance: a supported historical restore into an isolated branch, checks of actual application data/reference/tenant invariants, a verified recovery deployment and measured recovery time. A successful clone and migration do not satisfy those requirements. Snapshot restriction is an observed provider restriction; the remaining restore investigation is unfinished work, not automatically an external blocker for all recovery methods.
