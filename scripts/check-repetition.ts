// The settings panel lets the user pick a minimum word length from 2 upwards.
// Does the checker honour values below its own hardcoded regex bound?
import { findWordRepetitions } from '../src/frontend/languageToolService';

const text = 'Der Hund bellt. Die Kuh muht. Der Hund schlief, die Kuh auch.';

for (const minLen of [2, 3, 4, 5]) {
  const found = findWordRepetitions(text, 50, minLen).map(r => r.word);
  console.log(`minWordLength=${minLen} -> [${found.join(', ') || 'nothing'}]`);
}
console.log('\n"Kuh" (3 letters) repeats twice and should appear for minWordLength 2 and 3.');
