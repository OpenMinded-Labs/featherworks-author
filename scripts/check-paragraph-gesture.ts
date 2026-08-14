// Ad-hoc check of the paragraph-mark gesture. The bug this guards against was
// that a plain click marked a paragraph, which fires constantly while writing
// and collided with the synonym tooltip.
import { isParagraphMarkGesture } from '../src/frontend/components/CodeMirrorEditor';

type Ev = { button: number; altKey: boolean; metaKey: boolean; ctrlKey: boolean };
const ev = (o: Partial<Ev>): Ev => ({
  button: 0, altKey: false, metaKey: false, ctrlKey: false, ...o,
});

let failed = 0;
function check(label: string, actual: boolean, expected: boolean) {
  if (actual !== expected) {
    console.log(`FAIL ${label}: expected ${expected}, got ${actual}`);
    failed++;
  } else {
    console.log(`ok   ${label}`);
  }
}

// The gesture itself, on both platforms.
check('Cmd+Alt+click (macOS)', isParagraphMarkGesture(ev({ altKey: true, metaKey: true })), true);
check('Ctrl+Alt+click (Win/Linux)', isParagraphMarkGesture(ev({ altKey: true, ctrlKey: true })), true);

// Everything a writer does all day must NOT mark.
check('plain click', isParagraphMarkGesture(ev({})), false);
check('Alt only (block select)', isParagraphMarkGesture(ev({ altKey: true })), false);
check('Cmd only', isParagraphMarkGesture(ev({ metaKey: true })), false);
check('Ctrl only', isParagraphMarkGesture(ev({ ctrlKey: true })), false);
check('right click', isParagraphMarkGesture(ev({ button: 2, altKey: true, metaKey: true })), false);
check('middle click', isParagraphMarkGesture(ev({ button: 1, altKey: true, metaKey: true })), false);

console.log(failed === 0 ? '\nALL PASSED' : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
