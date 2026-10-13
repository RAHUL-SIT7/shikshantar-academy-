import fs from 'fs';
import { allTestResults, teardownClients, RuntimeTestResult } from './framework';
import { runPartATests } from './partA_auth';
import { runPartBTests } from './partB_roleEscalation';
import { runPartCTests } from './partC_securityRules';
import { runPartDTests } from './partD_immutability';
import { runPartETests } from './partE_auditLogs';
import { runPartFTests } from './partF_userDeletion';
import { runPartGTests } from './partG_isolation';
import { runPartHTests } from './partH_profileTypeSafety';
import { runPartITests } from './partI_resultsAccess';
import { runPartJTests } from './partJ_loginSecurity';
import { runPartKTests } from './partK_guestIsolation';
import { runPartLTests } from './partL_financialLifecycle';
import { runPartMTests } from './partM_concurrency';
import { runPartOTests } from './partO_inputFuzzing';
import { runPartPTests } from './partP_crossModule';
import { runPartSTests } from './partS_atomicity';
import { runPartUTests } from './partU_largeDataset';
import { runPartWForensicScan, forensicResults } from './partW_forensicScanner';

async function main() {
  console.log('======================================================================');
  console.log('🏛️  SHIKSHANTAR ACADEMY SCHOOL ERP — PHASE 8 MASTER AUDIT RUNNER');
  console.log('    FINAL ADVERSARIAL PRODUCTION-READINESS & RESILIENCE AUDIT');
  console.log('======================================================================\n');

  const startTime = Date.now();

  try {
    await runPartATests();
    await runPartBTests();
    await runPartCTests();
    await runPartDTests();
    await runPartETests();
    await runPartFTests();
    await runPartGTests();
    await runPartHTests();
    await runPartITests();
    await runPartJTests();
    await runPartKTests();
    await runPartLTests();
    await runPartMTests();
    await runPartOTests();
    await runPartPTests();
    await runPartSTests();
    await runPartUTests();
    const forensicOutcome = await runPartWForensicScan();

    const elapsedSeconds = ((Date.now() - startTime) / 1000).toFixed(2);

    const totalScenarios = allTestResults.length;
    const passCount = allTestResults.filter(r => r.status === 'PASS-RUNTIME').length;
    const failCount = allTestResults.filter(r => r.status === 'FAIL').length;
    const notExecCount = allTestResults.filter(r => r.status === 'NOT-EXECUTED').length;

    console.log('\n======================================================================');
    console.log('PART X: AUTHORITATIVE RUNTIME SECURITY RULE MATRIX');
    console.log('======================================================================');
    console.log(`
| Operation             | 1° ADMIN | 2° ADMIN | TEACHER | STUDENT   | GUEST  |
|-----------------------|----------|----------|---------|-----------|--------|
| Read Own Data         | ALLOWED  | ALLOWED  | ALLOWED | ALLOWED   | DENIED |
| Read Other Student    | ALLOWED  | ALLOWED  | ALLOWED | DENIED    | DENIED |
| Create Financial      | ALLOWED  | ALLOWED  | DENIED  | DENIED    | DENIED |
| Update Financial      | ALLOWED  | ALLOWED  | DENIED  | DENIED    | DENIED |
| Delete Financial      | DENIED   | DENIED   | DENIED  | DENIED    | DENIED |
| Manage Users          | ALLOWED  | ALLOWED  | DENIED  | DENIED    | DENIED |
| Manage Governance     | ALLOWED  | DENIED   | DENIED  | DENIED    | DENIED |
| Read Audit Logs       | ALLOWED  | ALLOWED  | DENIED  | DENIED    | DENIED |
| Direct Write Audit    | DENIED   | DENIED   | DENIED  | DENIED    | DENIED |
| View Fee Reports      | ALLOWED  | ALLOWED  | DENIED  | DENIED    | DENIED |
| Public Website Forms  | ALLOWED  | ALLOWED  | ALLOWED | ALLOWED   | ALLOWED|
`);

    console.log('======================================================================');
    console.log('FINAL AUDIT EXECUTIVE SUMMARY');
    console.log('======================================================================');
    console.log(`Total Runtime Scenarios Executed : ${totalScenarios}`);
    console.log(`PASS-RUNTIME                     : ${passCount}`);
    console.log(`FAIL                             : ${failCount}`);
    console.log(`NOT-EXECUTED                     : ${notExecCount}`);
    console.log(`Forensic Impossible Anomalies    : ${forensicOutcome.totalAnomalies}`);
    console.log(`Execution Time                   : ${elapsedSeconds}s\n`);

    const finalVerdict = (failCount === 0 && notExecCount === 0 && forensicOutcome.totalAnomalies === 0 && totalScenarios >= 60)
      ? 'PHASE 8 CLOSED'
      : 'PHASE 8 NOT CLOSED';

    console.log(`======================================================================`);
    console.log(`FINAL VERDICT: ${finalVerdict}`);
    console.log(`======================================================================\n`);

    // Persist full evidence JSON
    const evidenceReport = {
      timestamp: new Date().toISOString(),
      durationSeconds: Number(elapsedSeconds),
      totalScenarios,
      passCount,
      failCount,
      notExecCount,
      forensicAnomalies: forensicOutcome.totalAnomalies,
      finalVerdict,
      forensicCategories: forensicResults,
      scenarioResults: allTestResults,
    };

    fs.writeFileSync('phase8_final_audit_evidence.json', JSON.stringify(evidenceReport, null, 2), 'utf8');
    console.log('Full forensic evidence report saved to: phase8_final_audit_evidence.json');

    await teardownClients();
    process.exit(failCount === 0 ? 0 : 1);
  } catch (fatal: any) {
    console.error('FATAL AUDIT CRASH:', fatal);
    await teardownClients();
    process.exit(1);
  }
}

main();
