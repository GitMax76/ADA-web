# A.D.A. Web — consolidamento 0.3.8–0.3.9

Ramo sperimentale separato da main. **Non pubblicare su GitHub Pages.**

## Stato al 26 novembre 2026

- main: 0.3.4-beta.
- Base di questo ramo: rules-2026-test, 0.3.6-beta.
- Snapshot locale da importare: 0.3.8-beta-transparency-test. Non confondere il ramo con la versione locale finché package.json non è stato aggiornato.
- Risultati riportati per la 0.3.8 locale: 44 test unitari, simulazione su 19 pagine, 38/38 occorrenze mirate, nessuna sovrapposizione sui 402 riferimenti controllati. Build Vite e test browser non eseguiti: verifiche ancora necessarie.

## Prossimi passi

1. Importare lo snapshot locale verificato, con sole fixture sintetiche e senza PDF reali, log contenenti dati personali o credenziali.
2. Eseguire npm ci, npm run check, npm run test:unit, npm run build, npm run test:build e npx playwright test.
3. Verificare su PC autorizzato esportazione, coordinate, profilo Trasparenza, esclusione delle colonne Doc e Cod. Fascicoli, protezione dei riferimenti pubblici, prestazioni e privacy.
4. Annotare regressioni e risultati attesi in fixture sintetiche. Tenere i documenti originali fuori dal repository.
5. Condividere codice e modifiche tramite branch e pull request verso il ramo sperimentale. Non unire a main prima dell'approvazione e della validazione completa.

## Profilo Trasparenza

Oscurare: persone (privati, dipendenti, firmatari), titoli professionali, CF, P.IVA, ragioni sociali, email e PEC private e istituzionali, telefoni, IBAN, date di nascita e dati catastali.

Conservare: enti pubblici, indirizzi degli immobili, CUP, CIG, protocolli, ID documentali, fascicoli, riferimenti normativi, date amministrative e importi.

## Privacy

Il repository è pubblico. Non aggiungere PDF di lavoro, schermate riservate, dati personali o token. Le regole sono preset tecnici: resta obbligatoria la revisione dell'operatore. Nessun deploy beta autorizzato in questo ramo.
