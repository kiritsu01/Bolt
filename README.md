# BOLT

Puzzle da un dito: tocca una freccia, esce solo se la corsia fino al bordo è libera.
Gioco statico (React + Vite): nessun server, nessun database. I progressi restano nel browser di chi gioca.

## Avviare in locale
```
npm install
npm run dev
```
Apri l'indirizzo che compare (es. http://localhost:5173). Dal telefono, sulla stessa rete Wi-Fi, apri l'indirizzo "Network".

## Pubblicare
- `npm run build` crea la cartella `dist/`: caricala su qualsiasi hosting statico (GitHub Pages, Netlify, Cloudflare Pages, itch.io).
- `npm run build:single` crea `dist-single/index.html`: un unico file con tutto dentro.

## Struttura
- `src/game/` logica, generatore dei livelli, disegno su canvas, audio, testi it/en, salvataggi.
- `src/components/bolt-app.tsx` interfaccia: home, livelli, partita, risultati.
- `src/effects.css` effetti aggiunti: scritta delle combo (x5, x10...), coriandoli, ingresso dei pannelli.

## Note
- Le sfide tra amici funzionano col link `?c=CODICE`: servono un sito pubblicato (non il file aperto in locale).
- Font: Bricolage Grotesque e Outfit (licenza SIL OFL), inclusi tramite @fontsource.
- `npx vite build --mode e2e --outDir dist-e2e` crea una build per i test automatici con l'aggancio `window.__bolt`; la build normale non lo contiene.
