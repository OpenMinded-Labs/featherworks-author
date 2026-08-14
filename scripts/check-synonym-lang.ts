// Does the lookup language actually change the result? If not, routing
// editor_language into the synonym lookup would be a pointless change.
//
// The runtime thesaurus is fetched over HTTP and cannot load here, so this
// measures the bundled dictionaries, which use the same two-map split.
import { findLocalSynonyms } from '../src/frontend/synonyms';

const words = ['run', 'small', 'quiet', 'laufen', 'klein', 'leise'];

console.log('word    | looked up as EN            | looked up as DE');
console.log('--------|----------------------------|---------------------------');
let mismatches = 0;
for (const w of words) {
  const en = findLocalSynonyms(w, 'en').slice(0, 3);
  const de = findLocalSynonyms(w, 'de').slice(0, 3);
  if (en.join() !== de.join()) mismatches++;
  console.log(
    `${w.padEnd(7)} | ${(en.join(', ') || '(none)').padEnd(26)} | ${de.join(', ') || '(none)'}`
  );
}
console.log(
  `\n${mismatches} of ${words.length} words give a different result depending on the language.`
);
