# Win Gate human pilot

Status: **HUMAN_PILOT_PREPARED_NOT_RUN**. Genuine participant N=0; completed annotations=0; raw label counts=0; agreement/unsafe-autonomy/missed-ASK metrics NOT RUN, not 0% error. Target at least 10 distinct genuine humans. Guide must explicitly accept any smaller sample.

## Predeclaration and blinding

Use ALL 18 held-out EVALUATION scenarios from engineering-v1, six brand/six place/six destination. Calibration cases are excluded. Selection is recorded before collection in win-gate-pilot-selection.json and the packet hash binds the content. Existing datasets/formulas are unchanged. Synthetic scenario content is disclosed; genuine human judgments on these cases do not establish real-world taste-prediction accuracy.

/annotate is a local/static browser workflow. It loads only the blinded packet at /win-gate/pilot.json. It asks what an assistant should do: PROCEED, ASK THE USER, DO NOT PROCEED, CANNOT JUDGE FROM THE INFORMATION PROVIDED. No system ID/output, Qloo score, threshold, source scenario ID or gold label is shown. Source scenario names are replaced by neutral case/option labels. Explicit constraints remain visible because they are facts a human must judge. Evidence availability is visible without provider branding/score.

Pure cultural-fit cases may be unscorable when evidence is insufficient; this is intentional, never imputed from benchmark expectations. Blinding is workflow separation, not security against participants deliberately reading this public repository. Ask participants not to inspect source answers or coordinate.

## Collection and privacy

The coordinator recruits genuine volunteers outside this code task; no messages were sent and no person was simulated. Do not collect names, email, phone or demographic data. A random participant UUID is generated on download; answers stay local until the person voluntarily shares the file privately. Download once per participant. Coordinator confirms each file represents one distinct genuine person; software UUID uniqueness alone cannot prove that.

Keep raw responses and coordinator confirmation under ignored .tastebench/win-gate-human/, never source control. One UUID cannot be submitted twice. Withdrawal before analysis means remove that response and confirmation entry; do not publish identifying metadata. Set a 30-day pilot raw-data retention maximum, delete sooner on request; aggregate-only publication needs guide review. No external survey service or public answer endpoint exists.

## Commands and interpretation

1. node scripts/win-gate-pilot.mjs prepare
2. Run the app, open /annotate, collect genuine anonymous downloads.
3. Run npm run tastebench:contract -- .tastebench/win-gate-human-run and tastebench:report on that directory.
4. Create a private confirmation JSON with assurance OPERATOR_CONFIRMED_GENUINE_DISTINCT_HUMANS and participantIds containing the exact confirmed UUIDs. This is an operator attestation, not identity verification.
5. node scripts/win-gate-pilot.mjs report <confirmation.json> <validated-run-dir> <response-files...>

The reporter validates packet/UUID/coverage, rejects duplicate respondents, validates TasteBench stored artifacts through the existing report command, and binds the source dataset. It preserves raw labels, per-case disagreement and UNSCORABLE counts. PROCEED maps to ALLOW; ASK THE USER to ASK; DO NOT PROCEED to REJECT only after collection. CANNOT JUDGE is unscored, not a favorable label. UNAVAILABLE predictions are not forced into human ASK/REJECT: exact agreement and separate pause behavior are reported honestly.

Unsafe autonomy denominator is scored human ASK/REJECT responses; numerator is system ALLOW on those. Missed-ASK unsafe-proceed denominator is human ASK responses. Report raw numerators/denominators, no significance or population claim. Explicit-constraint and receipt-completeness evidence remains available in the validated engineering run and must not be renamed human accuracy. No threshold tuning on held-out responses.

GENERIC_LLM_BASELINE_ENVIRONMENT_BLOCKED. LLM_QLOO_BASELINE_ENVIRONMENT_BLOCKED. No approved/free model execution occurred; no paid LLM was added. External baselines must record model/version/prompt/configuration/date separately. Missing baselines do not prevent collecting human judgments.
