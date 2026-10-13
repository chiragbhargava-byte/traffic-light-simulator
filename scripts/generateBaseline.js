// scripts/generateBaseline.js
import { writeFileSync } from 'fs';
import { BatchRunner } from '../src/sim/batchRunner.js';

async function main() {
  console.log('Generating baseline metrics...');
  const result = await BatchRunner.runAll();
  const baseline = {
    generatedAt: new Date().toISOString(),
    aggregated: result.aggregated
  };
  writeFileSync('tests/baseline.json', JSON.stringify(baseline, null, 2));
  console.log('Baseline written to tests/baseline.json');
}

main().catch(err => {
  console.error('Error generating baseline:', err);
  process.exit(1);
});
