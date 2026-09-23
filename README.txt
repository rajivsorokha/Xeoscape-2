HOW TO APPLY THESE FILES
=========================

Do NOT use "git apply" with this folder — these are complete files,
not a patch. Just copy them over the matching paths in your project,
overwriting whatever is there now:

  C:\Users\PC\Desktop\Pharmacy\Thomas\Xeoscape-2-Thomas\Xeoscape-2-full-update\

The folder structure inside this zip mirrors your project exactly, so
for example:

  assets\js\shared\print-utils.js
    -> copy to ...\Xeoscape-2-full-update\assets\js\shared\print-utils.js

  tests\unit\report-generator.test.js
    -> copy to ...\Xeoscape-2-full-update\tests\unit\report-generator.test.js

...and so on for all 17 files listed below.

If you're comfortable with PowerShell, from inside the extracted
folder you can do this in one go (adjust the destination path if it's
different):

  robocopy . "C:\Users\PC\Desktop\Pharmacy\Thomas\Xeoscape-2-Thomas\Xeoscape-2-full-update" /E /XF README.txt

(robocopy's exit codes 0-7 all mean success — anything 8+ is a real error.)

FILES INCLUDED
==============
assets/js/modules/cart/cart-ui.js              (modified)
assets/js/modules/checkout/receipt.js          (modified)
assets/js/modules/labels/label-quick-print.js  (modified)
assets/js/modules/labels/label-sheet.js        (modified)
assets/js/modules/labels/label-sizes.js        (modified -- new 2x1in/2UP preset)
assets/js/modules/settings/barcode-labels.js   (modified)
assets/js/shared/barcode-scanner.js            (new)
assets/js/shared/print-utils.js                (new)
tests/helpers/data-dir.js                      (new)
tests/integration/api.test.js                  (modified)
tests/unit/activation.test.js                  (modified)
tests/unit/backup-manager.test.js              (modified)
tests/unit/barcode-scanner.test.js             (new)
tests/unit/email-settings.test.js              (modified)
tests/unit/garment-intake.test.js              (modified)
tests/unit/label-sheet.test.js                 (modified -- new rotation tests)
tests/unit/label-sizes.test.js                 (new)
tests/unit/product-manager.test.js             (modified)
tests/unit/report-generator.test.js            (modified)
tests/unit/transaction-manager.test.js         (modified)

AFTER COPYING
=============
1. npm test                 -> should show 14 suites / 123 tests passing
2. npm run backend:build    -> repacks the backend + assets
3. npm run tauri:build      -> produces the new installer

Then install that new installer on the affected PC(s) and test:
  - print a barcode label
  - print a billing receipt
  - plug in the DC7132 scanner and scan an item while focus is NOT on
    the barcode box (e.g. click into the discount field first)
