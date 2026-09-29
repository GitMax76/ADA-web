# A.D.A. Web — 0.2.0-beta
Anonimizzatore Documenti Autonomo. Release **GitHub Pages Ready**, derivata dal codice originale **0.1.9-beta No Nested Scroll**.

**App:** https://GitMax76.github.io/ADA-web/

## Funzioni mantenute
- Coda PDF multipla, analisi di un documento alla volta, anteprima multipagina e zoom.
- Ricerca locale di codice fiscale, IBAN, email/PEC, partita IVA, telefono e date; euristiche per nomi e indirizzi.
- OCR italiano opzionale con Tesseract.js.
- Filtri per tipo, stato, pagina e testo; attivazione/disattivazione dei rilevamenti.
- Aree manuali, regolazione dei riquadri e modalità di precisione.
- Esportazione rasterizzata, annullamento e reset della sessione.
- Disclaimer e accettazione al primo utilizzo.
- Lista Rilevamenti senza scroll interno a ogni larghezza, tab Anteprima/Rilevamenti e ResizeObserver della 0.1.9.

## Privacy e limiti
L'app elabora i PDF nel browser: non include backend, upload, telemetria o salvataggio dei documenti nella repository. I file selezionati restano nella sessione; il risultato viene scaricato sul dispositivo. LocalStorage conserva l'accettazione delle informative.

GitHub ospita il codice e gli asset e riceve le normali richieste HTTP del sito. L'OCR della 0.1.9 scarica a richiesta worker, motore WASM e modello italiano dai servizi configurati da Tesseract.js (jsDelivr e tessdata.projectnaptha.com); non invia i PDF. **L'OCR richiede connettività e non è garantito offline.** La PWA conserva invece l'interfaccia e il worker PDF per riaprire e usare PDF testuali offline dopo una prima installazione completa.

Il rilevamento è euristico: occorre controllare e correggere le aree prima di esportare. L'output contiene immagini con oscuramenti incorporati nei pixel e perde il testo ricercabile. Questa release corregge inoltre gli a capo CSS malformati del blocco No Nested Scroll originale e stabilizza il ResizeObserver per evitare oscillazioni del layout e conserva gli algoritmi della 0.1.9; non costituisce una validazione della completezza dell'anonimizzazione. Non è un prodotto ufficiale del Ministero della Cultura.

## Sviluppo
Node.js 20.19+ oppure 22.12+ (CI: Node 22).

```sh
npm ci
npm run dev
```

Aprire http://localhost:5173/ADA-web/ . Su Windows è disponibile anche AVVIA_ADA_WEB.bat.
Il launcher installa le dipendenze al primo avvio. PREPARA_ADA_WEB.bat prepara e compila il progetto.

```sh
npm run check
npm run build
npm run test:build
npm run preview
```

Anteprima produzione: http://localhost:4173/ADA-web/ . La PWA è disabilitata nel server di sviluppo e abilitata nella build. L'installazione PWA richiede HTTPS o localhost.

## GitHub Pages
In Settings → Pages selezionare **GitHub Actions**. Ogni push su main esegue controlli, build e deploy della sola cartella dist; le pull request eseguono la validazione senza pubblicare.
Il base path Vite, lo scope e lo start URL del manifest sono **/ADA-web/**, con maiuscole esatte.
package-lock.json fissa le dipendenze; la CI usa npm ci. PDF.js resta fissato alla versione originale 5.4.149.

## PWA e aggiornamenti
Il manifest e sw.js sono generati da vite-plugin-pwa. Icone 192/512, maskable e Apple derivano dall'icona originale.
La precache include asset con revisione, file .mjs e worker PDF. Il nome della cache contiene lo scope e la versione **0.2.0-beta**; l'attivazione elimina solo cache precedenti appartenenti a questa app.
Non vengono intercettati o memorizzati documenti, blob o richieste arbitrarie.
Gli aggiornamenti attendono la chiusura di tutte le schede/finestre A.D.A., senza ricaricare una sessione in corso. Per applicare una nuova release, chiudere tutte le istanze e riaprire.
Aggiornare la versione anche in src/sw.js a ogni release.

## Repository
Non aggiungere PDF di prova reali, documenti utente o esportazioni. .gitignore esclude i formati documentali comuni, cartelle di input/output, segreti locali e build.
Non è stata assegnata una nuova licenza al codice del progetto; le librerie mantengono le rispettive licenze.

Riferimenti tecnici: [Vite Pages](https://vite.dev/guide/static-deploy.html#github-pages), [ciclo di aggiornamento PWA](https://vite-pwa-org.netlify.app/guide/auto-update).



## Verifica browser
```sh
npx playwright install chromium
npx playwright test
```
In locale il test usa Microsoft Edge; in CI usa Chromium. Per un altro browser modificare channel in playwright.config.js. Il test crea PDF sintetici in memoria e verifica analisi/esportazione su due pagine, filtri, layout a 1440/754/390 px e analisi PDF offline. Nessun documento di test viene aggiunto alla repository.
