# Σύμβαση σκηνών `book-scene-v1`

Η σύμβαση επιτρέπει σε οποιαδήποτε εκπαιδευτική εφαρμογή να δίνει σκηνές στο
βιβλίο χωρίς ο renderer να γνωρίζει το αντικείμενο ή την εσωτερική της δομή.

## 1. Δήλωση σκηνής στο βιβλίο

```json
{
  "type": "scene",
  "id": "oscillation-energy",
  "title": "Ενέργεια ταλάντωσης",
  "singleSrc": "../oscillator/index.html?scene=energy&time=0&play=0",
  "placement": "wide",
  "frameWidth": 714,
  "aspectRatio": "16/9",
  "hideCaption": false
}
```

Η αρχική κατάσταση πρέπει, όπου είναι δυνατό, να κωδικοποιείται στο URL. Έτσι η
σκηνή είναι αναπαραγώγιμη, αντιγράφεται εύκολα και λειτουργεί ακόμη και χωρίς
επικοινωνία JavaScript.

## 2. Προαιρετικό API μέσα στην εφαρμογή

Η εφαρμογή μπορεί να εκθέτει:

```js
window.BookScene = {
  version: "1.0",
  getState,
  setState,
  play,
  pause,
  reset,
  step,
  getPrintSnapshot
};
```

- `getState()` επιστρέφει απλό JSON.
- `setState(state)` εφαρμόζει πλήρη ή μερική κατάσταση.
- `play()`, `pause()`, `reset()` ελέγχουν την κίνηση.
- `step(delta)` μετακινεί τη σκηνή κατά ένα βήμα.
- `getPrintSnapshot()` επιστρέφει data URL εικόνας, κατά προτίμηση PNG.

## 3. Επικοινωνία με `postMessage`

Για εφαρμογές άλλου origin, το βιβλίο στέλνει:

```js
{
  type: "book-scene:capture-print-snapshot",
  protocol: "book-scene-v1",
  requestId: "μοναδικό-id"
}
```

Η εφαρμογή απαντά:

```js
{
  type: "book-scene:print-snapshot",
  requestId: "μοναδικό-id",
  dataUrl: "data:image/png;base64,..."
}
```

Το `requestId` πρέπει να επιστρέφεται αμετάβλητο. Η εφαρμογή οφείλει επίσης να
ελέγχει το `event.origin` όταν γνωρίζει από ποιο origin ενσωματώνεται.

## 4. Κανόνες στιγμιότυπου εκτύπωσης

- Ίδια κατάσταση, κάμερα, ορατά επίπεδα και γραφήματα με τη ζωντανή σκηνή.
- Χωρίς χειριστήρια που δεν έχουν νόημα στο χαρτί.
- Αδιαφανές λευκό φόντο, εκτός αν η σκηνή απαιτεί άλλο.
- Επαρκής ανάλυση για το πραγματικό μέγεθος εκτύπωσης.
- Καμία αλλαγή της αναλογίας πλαισίου ανάμεσα σε οθόνη και εκτύπωση.

## 5. Συμβατότητα

Ο αναγνώστης v0.1 δοκιμάζει πρώτα το ουδέτερο `BookScene` και το μήνυμα
`book-scene-v1`. Προσωρινά διατηρεί και τον παλιό μηχανισμό στιγμιότυπου του
υπάρχοντος βιβλίου ΗΜ κύματος, ώστε η μετάβαση να γίνει χωρίς σπάσιμο.

## 6. Πραγματικό execution path του HMK checkpoint

Στον έλεγχο εκτύπωσης της 24ης Ιουλίου 2026 προετοιμάστηκαν επιτυχώς και τα
10/10 στιγμιότυπα και ελέγχθηκε το πραγματικό PDF των 28 σελίδων.

| Εφαρμογή σκηνής | Πλήθος εμφανίσεων | Κλάδος που έδωσε το στιγμιότυπο |
|---|---:|---|
| `index-hmk.html` | 7 | `window.getBookPrintSnapshot()` |
| `electrostatic_field_book_ready.html` | 3 | `window.getBookPrintSnapshot()` |
| **Σύνολο** | **10** | **άμεσο same-origin API** |

Η σειρά δοκιμής του reader είναι:

1. `BookScene.getPrintSnapshot()`,
2. `window.getBookPrintSnapshot()`,
3. `EMWaveApp.getPrintSnapshot()`,
4. ουδέτερο μήνυμα `book-scene-v1`,
5. παλιό μήνυμα `capturePrintSnapshot` / `hm_print_snapshot`,
6. κρυφό clone της σκηνής ως τελευταία εφεδρεία.

Στο συγκεκριμένο checkpoint ο δεύτερος κλάδος πέτυχε και στις 10 σκηνές. Άρα
το PDF αποδεικνύει τη λειτουργία του άμεσου compatibility hook, όχι ακόμη του
`BookScene` ή του cross-origin `book-scene-v1`. Οι δύο μηχανισμοί μηνυμάτων και
το clone fallback παραμένουν διαθέσιμα, αλλά δεν εκτελέστηκαν στη δοκιμασμένη
διαδρομή.
