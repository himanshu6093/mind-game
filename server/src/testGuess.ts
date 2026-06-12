import { evaluateGuess, validateCode } from './roomManager';

function runTests() {
  console.log('--- RUNNING BULLS & COWS LOGIC TESTS ---');

  const testCases = [
    {
      secret: '1234',
      guess: '1234',
      expected: { correctPosition: 4, wrongPosition: 0, incorrect: 0 }
    },
    {
      secret: '1234',
      guess: '4321',
      expected: { correctPosition: 0, wrongPosition: 4, incorrect: 0 }
    },
    {
      secret: '1234',
      guess: '1389',
      expected: { correctPosition: 1, wrongPosition: 1, incorrect: 2 }
    },
    {
      secret: '1234',
      guess: '5678',
      expected: { correctPosition: 0, wrongPosition: 0, incorrect: 4 }
    },
    {
      secret: '5812',
      guess: '1825',
      expected: { correctPosition: 1, wrongPosition: 3, incorrect: 0 }
    }
  ];

  let passed = true;

  testCases.forEach((tc, idx) => {
    const result = evaluateGuess(tc.secret, tc.guess);
    const success = 
      result.correctPosition === tc.expected.correctPosition &&
      result.wrongPosition === tc.expected.wrongPosition &&
      result.incorrect === tc.expected.incorrect;

    console.log(`Test #${idx + 1}: Secret=${tc.secret}, Guess=${tc.guess}`);
    console.log(`  Expected: ✅=${tc.expected.correctPosition}, 🔄=${tc.expected.wrongPosition}, ❌=${tc.expected.incorrect}`);
    console.log(`  Got:      ✅=${result.correctPosition}, 🔄=${result.wrongPosition}, ❌=${result.incorrect}`);
    
    if (success) {
      console.log('  Result:   PASS ✅');
    } else {
      console.log('  Result:   FAIL ❌');
      passed = false;
    }
    console.log('----------------------------');
  });

  // Code validation tests
  console.log('--- RUNNING CODE VALIDATION TESTS ---');
  const validationCases = [
    { code: '1234', valid: true },
    { code: '123', valid: false }, // Too short
    { code: '12345', valid: false }, // Too long
    { code: '1223', valid: false }, // Duplicate digits
    { code: 'abcd', valid: false }, // Non-digits
    { code: '1029', valid: true }
  ];

  validationCases.forEach((vc, idx) => {
    const result = validateCode(vc.code, 4, false);
    const success = result === vc.valid;
    console.log(`Validation #${idx + 1}: Code=${vc.code}, Expected=${vc.valid}, Got=${result}`);
    if (success) {
      console.log('  Result:   PASS ✅');
    } else {
      console.log('  Result:   FAIL ❌');
      passed = false;
    }
    console.log('----------------------------');
  });

  if (passed) {
    console.log('ALL TESTS PASSED SUCCESSFULLY! 🚀');
    process.exit(0);
  } else {
    console.log('SOME TESTS FAILED. CHECK IMPL. ❌');
    process.exit(1);
  }
}

runTests();
