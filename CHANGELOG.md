# 0.2.0-beta — GitHub Pages Ready

- Base /ADA-web/, workflow Pages e lockfile.
- Manifest, icone installabili e cache versionata con worker PDF.
- Aggiornamenti senza interruzione della sessione; pulizia cache limitata all'app.
- Funzioni della 0.1.9 preservate; corretti gli a capo letterali nel CSS No Nested Scroll e il ciclo di oscillazione del ResizeObserver.

# Note storiche originali

## 0.1.9-beta — NO-NESTED-SCROLL / ADAPTIVE REVIEW

- eliminata la scrollbar interna dei rilevamenti **a tutte le larghezze**;
- la lista usa sempre lo scroll naturale della pagina;
- nuova rilevazione adattiva basata sulla larghezza reale del pannello Rilevamenti tramite `ResizeObserver`;
- i tab Anteprima / Rilevamenti si attivano anche quando la colonna diventa stretta per zoom browser o layout, non solo tramite media query;
- mantenuti filtri, disclaimer, PWA, oscuramento e regolazione manuale.


## 0.1.8-beta — MOBILE-SCROLL-FIX

- eliminata la scrollbar interna dei rilevamenti sotto 1100 px;
- la lista usa lo scroll naturale della pagina su tablet e smartphone;
- tab Anteprima / Rilevamenti attivi sotto 1100 px;
- filtri e intestazione restano accessibili durante la revisione;
- controlli touch ingranditi;
- invalidazione delle vecchie cache/service worker durante lo sviluppo locale;
- cache PWA di produzione configurata per rimuovere le versioni obsolete.

# A.D.A. Web — 0.1.7-beta

Versione web/PWA di **A.D.A. — Anonimizzatore Documenti Autonomo**.

## Principio fondamentale

Il PDF viene elaborato **nel browser del dispositivo**. Il progetto non include backend, upload, database o API remote per i documenti.

## Funzioni presenti in questa milestone

- caricamento singolo/multiplo PDF;
- interfaccia responsive smartphone/desktop;
- parsing e rendering PDF locale con PDF.js;
- rilevamento locale di Codice Fiscale, IBAN, email/PEC, telefono, P.IVA, date;
- rilevamento euristico iniziale di nomi e indirizzi;
- OCR locale opzionale con Tesseract.js per pagine senza testo;
- elenco rilevamenti modificabile con attiva/disattiva;
- anteprima con oscuramenti;
- pulsante Annulla e Reset sessione;
- esportazione PDF anonimizzato;
- PWA installabile;
- nessun salvataggio del documento nella repository.

## Nota sulla redazione

Per questa beta l'esportazione usa una strategia **rasterizzata**: ogni pagina viene renderizzata, le aree rilevate vengono bruciate nei pixel e viene creato un nuovo PDF da immagini. In questo modo il testo originale non rimane come livello testuale nascosto sotto un rettangolo nero.

Il rovescio della medaglia è che il PDF esportato perde il livello testo ricercabile. È una scelta intenzionale e prudente per la prima milestone.

## Avvio locale su Windows — consigliato

Richiede **Node.js 20.19+ oppure 22.12+**.

1. Estrarre tutta la cartella.
2. Fare doppio clic su **`AVVIA_ADA_WEB.bat`**.
3. Al primo avvio il launcher esegue automaticamente `npm install`; dagli avvii successivi parte direttamente A.D.A. Web.
4. Il browser si apre automaticamente su `http://127.0.0.1:5173`.
5. Per arrestare il server locale premere `Ctrl+C` nella finestra del launcher.

È incluso anche **`PREPARA_ADA_WEB.bat`**, utile dopo una nuova release: installa/aggiorna le dipendenze ed esegue anche una build di verifica.

> Il primo `npm install` usa Internet esclusivamente per scaricare le librerie del progetto. I documenti caricati in A.D.A. Web non vengono inviati a npm, GitHub o ad altri server.

### Avvio manuale alternativo

```bash
npm install
npm run dev
```

Aprire l'indirizzo indicato da Vite, normalmente `http://localhost:5173`.

Per provarla da smartphone sulla stessa rete Wi-Fi, usare l'indirizzo LAN mostrato da Vite, ad esempio `http://192.168.1.20:5173`.

## Build statica

```bash
npm run build
```

La cartella `dist/` è pubblicabile su GitHub Pages.

## Limiti noti della 0.1.5-beta

1. Il riconoscimento dei **nomi e indirizzi** è ancora euristico; la versione successiva dovrà integrare un NER italiano ONNX eseguito nel browser.
2. L'OCR è volutamente conservativo: su scansioni complesse va sempre effettuato il controllo visivo dell'operatore.
3. L'anteprima evidenzia con maggiore precisione i PDF testuali; per scansioni la redazione usa i bounding box OCR disponibili.
4. La gestione batch è presente come coda di caricamento ma in questa milestone si elabora un documento corrente alla volta.

## Sicurezza e privacy

- Nessun `fetch()` dei documenti.
- Nessun upload.
- Nessun backend.
- I PDF vengono mantenuti in memoria solo durante la sessione.
- `Reset` termina il worker OCR e azzera riferimenti ai file e agli ArrayBuffer.
- Alla chiusura della pagina vengono eliminati i riferimenti mantenuti dall'app.

> Il controllo visivo dell'operatore resta obbligatorio prima dell'uso del documento anonimizzato.


## Novità 0.1.3-beta
- Navigazione multipagina con pulsanti precedente/successiva e contatore pagina.
- Striscia di miniature cliccabili per passare rapidamente tra le pagine.
- Modalità **Area manuale**: trascina con mouse o dito direttamente sull’anteprima.
- Le aree manuali compaiono nei rilevamenti, possono essere disattivate o eliminate e vengono incorporate realmente nel PDF rasterizzato in esportazione.


## Novità 0.1.3-beta — Precision Fix

- modalità **Precisa / Normale / Ampia** per l’altezza dei rettangoli;
- i rilevamenti contenuti dentro una riga non oscurano più automaticamente l’intera riga: la larghezza viene stimata sul solo testo corrispondente;
- stessa geometria usata in anteprima ed esportazione;
- **Regola aree**: trascina un rettangolo per spostarlo e usa la maniglia nell’angolo in basso a destra per ridimensionarlo;
- zoom anteprima 80%–200%;
- le correzioni manuali vengono salvate come coordinate normalizzate e rispettate nel PDF esportato.

Per documenti reali resta obbligatorio il controllo visivo dell’operatore prima del download finale.


## Novità 0.1.4-beta — Detection Filters

- barra filtri nella sezione **Rilevamenti** senza modificare lo stato reale delle anonimizzazioni;
- filtro **Tipo**: Tutti, Nomi, Codici fiscali, Email/PEC, Telefoni, IBAN, P.IVA, Indirizzi, Date, Aree manuali;
- filtro **Stato**: Tutti, Attivi, Disattivati;
- filtro **Pagina**: Tutte, Pagina corrente o una singola pagina del documento;
- **Pagina corrente** segue automaticamente la pagina visualizzata nell'anteprima;
- ricerca testuale nei rilevamenti;
- pulsante **Azzera filtri**;
- contatore dinamico **X di Y rilevamenti**;
- layout compatto e responsive per smartphone.

I filtri modificano esclusivamente ciò che viene mostrato nella lista: non attivano, disattivano o eliminano rilevamenti.


## Novità 0.1.5-beta — MiC Style, mobile & disclaimer

- identità visiva aggiornata secondo il manuale del Ministero della Cultura;
- palette principale MiC: `#2D489D`, `#4D4D4D`, nero e bianco;
- logo MiC integrato senza alterazioni cromatiche o geometriche;
- intestazione con dicitura: **“Tool sviluppato dalla Soprintendenza ABAP per le Province di Salerno e Avellino, Ufficio Informatico.”**;
- revisione responsive mobile-first di header, pannelli informativi e footer;
- sezione espandibile **Informazioni, privacy e disclaimer**;
- avviso esplicito sul controllo visivo obbligatorio e sui limiti del rilevamento automatico;
- richiamo alla necessità di valutare anche il rischio di re-identificazione attraverso informazioni di contesto;
- sezione **Per saperne di più** con riferimenti istituzionali a GDPR/EUR-Lex, Garante Privacy ed EDPB, inclusi materiali su IA, pseudonimizzazione e anonimizzazione.

### Nota sul logo MiC

Il logo utilizzato nell'interfaccia deriva dal materiale fornito per il progetto e viene mantenuto nelle proporzioni e nei colori originali. Non vengono applicati effetti, rotazioni o ricolorazioni.


## Novità 0.1.7-beta — Discreet Style & First Use Policy

- rimosso il logo ufficiale MiC dall'interfaccia principale;
- mantenuto un richiamo discreto tramite palette, tono visivo e impianto istituzionale;
- integrata nell'header l'icona A.D.A. già usata come riferimento per la versione desktop/web mockup;
- dicitura dell'Ufficio Informatico mantenuta in forma sobria e non invasiva;
- aggiunto **modale di primo accesso** con disclaimer, privacy locale e avvertenze operative;
- per proseguire è necessario consultare le tre sezioni, spuntare la dichiarazione e premere **Accetta e continua**;
- l'accettazione viene memorizzata localmente nel browser tramite `localStorage`;
- responsive ulteriormente rifinito su smartphone per header, footer e modale iniziale.


## 0.1.7-beta — Mobile Review UX + Launcher Fix

- corretto `AVVIA_ADA_WEB.bat`: apertura browser tramite PowerShell `Start-Process`, evitando l'errore Windows relativo al percorso `\`;
- introdotti su smartphone i tab **Anteprima** / **Rilevamenti**;
- eliminato lo scroll interno della lista rilevamenti su viewport mobile;
- i rilevamenti usano lo scroll naturale della pagina;
- filtri resi sticky durante la revisione mobile;
- card e controlli touch ingranditi;
- contatore rilevamenti mostrato anche nel tab mobile;
- layout desktop invariato.



