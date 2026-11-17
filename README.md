# BOLT

Puzzle da un dito: tocca una freccia, esce solo se la corsia fino al bordo è libera.
Gioco statico (React + Vite): nessun server, nessun database. I progressi restano nel browser di chi gioca.

## Avviare in locale
```
npm install
npm run dev
```
Apri l'indirizzo che compare (es. http://localhost:5173). Dal telefono, sulla stessa rete Wi-Fi, apri l'indirizzo "Network".

## Test
```
npm test
```
Usa il test runner di Node (nessuna dipendenza in più). Controlla che ogni livello generato (1-120, Sfida di oggi, Rush) sia risolvibile, le tre meccaniche nuove, i codici sfida, la conversione dei salvataggi v1, monete, indizi e condivisione.

## Pubblicare
- `npm run build` crea la cartella `dist/`: caricala su qualsiasi hosting statico (GitHub Pages, Netlify, Cloudflare Pages, itch.io).
- `npm run build:single` crea `dist-single/index.html`: un unico file con tutto dentro.

## Novità
- **Condivisione stile Wordle** (Sfida di oggi, livelli, sfide): titolo, riga di emoji (🟥 errore, 🟧 tratto in combo, ⬜ uscita normale), errori, combo migliore, tempo e link `?c=CODICE`. Usa `navigator.share` dove esiste, altrimenti copia negli appunti.
- **Capitoli** da 15 livelli, ognuno con nome, colore d'accento e una meccanica nuova presentata da una schermata a un tocco:
  1. *Scintilla* (1-15): le basi, livelli identici a prima.
  2. *Lucchetti* (16-30): frecce bloccate, si liberano quando esce una freccia adiacente. Toccarle è un errore.
  3. *Vortice* (31-45): frecce con l'anello, ruotano di 90° in senso orario quando esce una freccia adiacente. Si può finire in un vicolo cieco: il gioco lo segnala e basta Annulla.
  4. *Doppio colpo* (46-60): frecce con la cornice, servono due tocchi.
  5. *Tempesta* (61+, senza fine): le tre meccaniche si alternano.
  La schermata Livelli è una mappa per capitoli. I livelli si costruiscono partendo da un ordine di uscita valido e vengono verificati con `solve`/`isSolvable` in `src/game/logic.ts`; l'indizio sceglie sempre una mossa che lascia la griglia risolvibile. Il codice sfida porta con sé la meccanica (i codici vecchi restano validi).
- **Monete e negozio**: 1 moneta per ogni stella nuova, 5 per la Sfida di oggi (la prima volta del giorno), 1 ogni 100 punti in Rush. Nel negozio 7 temi colore e 5 stili di freccia, solo estetici. Nei capitoli 2-5 l'accento del capitolo prende il posto di quello del tema durante la partita.
- **Indizi a scorta**: 3 gratis al giorno, si ricaricano a mezzanotte (ora locale). Finiti quelli, "Guarda un annuncio per un indizio" chiama `showRewardedAd()` in `src/game/ads.ts`.
- **PWA**: manifest, icone generate da `scripts/make-icons.mjs` (`npm run icons`), service worker generato in build (`src/pwa/sw-template.js` + plugin in `vite.config.ts`) per giocare offline. Dopo il terzo livello completato la home mostra un invito chiudibile ad aggiungere BOLT alla schermata Home (pulsante del browser su Android/Chrome, istruzioni su iPhone).
- **Effetti**: scia delle frecce in uscita, spazzata luminosa quando la griglia si svuota, tono che sale con la combo (scala pentatonica). Con `prefers-reduced-motion` niente scia né scosse e la spazzata diventa una dissolvenza.

## Pubblicità
Tutto passa da `showRewardedAd()` in `src/game/ads.ts`: oggi mostra un annuncio finto di 3 secondi. Per collegare un circuito vero basta sostituire il corpo della funzione, rispettando il contratto scritto nel file (Promise che si risolve a `true` solo se l'annuncio è stato visto fino in fondo, mai rifiutata).

## Salvataggi
I progressi stanno in `localStorage` alla chiave `bolt-save-v2` (formato versione 2). Al primo avvio un salvataggio della versione 1 (`bolt-save-v1`) viene convertito in automatico: livelli, stelle, record, serie e impostazioni restano, e ogni stella già guadagnata vale una moneta.

## Struttura
- `src/game/` logica, generatore dei livelli, disegno su canvas, audio, testi it/en, salvataggi.
- `src/components/bolt-app.tsx` interfaccia: home, livelli, partita, risultati.
- `src/game/chapters.ts` capitoli; `cosmetics.ts` temi e stili di freccia; `hints.ts` scorta indizi; `share.ts` testo da condividere; `ads.ts` pubblicità; `pwa.ts` service worker e invito all'installazione.
- `src/effects.css` effetti aggiunti: scritta delle combo (x5, x10...), coriandoli, ingresso dei pannelli.
- `src/features.css` stili delle novità (mappa, presentazione capitoli, negozio, indizi, invito Home).
- `tests/` test automatici (`npm test`).

## Note
- Le sfide tra amici funzionano col link `?c=CODICE`: servono un sito pubblicato (non il file aperto in locale).
- Font: Bricolage Grotesque e Outfit (licenza SIL OFL), inclusi tramite @fontsource.
- Il service worker si registra solo nella build pubblicata servita in https (o su localhost), non in `npm run dev` né nel file singolo.
- `npx vite build --mode e2e --outDir dist-e2e` crea una build per i test automatici con l'aggancio `window.__bolt`; la build normale non lo contiene.
