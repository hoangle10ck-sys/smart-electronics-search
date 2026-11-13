import { evaluateAdvisorDialogues } from '../services/advisorConversationEvaluation';

const report = evaluateAdvisorDialogues();
console.log(JSON.stringify(report, null, 2));
if (report.deterministicFailures.length) process.exitCode = 1;
