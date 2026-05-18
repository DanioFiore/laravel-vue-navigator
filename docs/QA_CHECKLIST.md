# Laravel-Vue Navigator — Checklist QA manuale

Checklist ripetibile per validare l’estensione su un **monorepo reale** (Laravel + Vue/TS) prima di pubblicare su Marketplace o rilasciare una versione.

**Versione estensione sotto test:** _______________  
**Data:** _______________  
**Tester:** _______________  
**IDE:** VS Code / Cursor — versione _______________  
**OS:** _______________

---

## Come usare questo documento

1. Compila la sezione **Setup** una sola volta per sessione di test.
2. Esegui i casi nell’ordine suggerito (prima i flussi base, poi edge case).
3. Per ogni riga segna: **OK** | **FAIL** | **N/A** (non applicabile) e annota note.
4. In caso di **FAIL**, allega: screenshot, riga di log dall’output channel, path file usato.

Legenda colonne tabella casi:

| Colonna | Significato |
|---------|-------------|
| **ID** | Identificativo del caso |
| **Passi** | Cosa fare |
| **Atteso** | Comportamento corretto |
| **Esito** | OK / FAIL / N/A |
| **Note** | Osservazioni, link issue |

---

## 1. Prerequisiti

### 1.1 Ambiente di test

- [ ] Workspace aperto con **almeno** un progetto Laravel (file `artisan` presente, anche in sottocartella).
- [ ] Frontend Vue o TS/JS con chiamate `axios` (o wrapper `api` / `http` / `client`).
- [ ] PHP disponibile in PATH **oppure** test dedicato con `useArtisan: false` (vedi sezione 7).
- [ ] Estensione installata tramite:
  - [ ] **Extension Development Host** (F5 dal repo dell’estensione), oppure
  - [ ] **`.vsix` locale** (`npm run package` → *Install from VSIX*), oppure
  - [ ] **Marketplace** (smoke test post-publish).

### 1.2 Verifica attivazione

- [ ] Apri un file `.vue`, `.ts` o `.js` del frontend.
- [ ] Output channel **“Laravel-Vue Navigator”** visibile (*View → Output* → seleziona il canale).
- [ ] Log iniziale contiene una riga tipo `Using Laravel root: ...` (se `artisan` trovato).
- [ ] Status bar in basso a destra mostra un item **LVN:** (es. `LVN: N routes (artisan)`).

Se l’estensione resta idle senza log Laravel root:

- Imposta manualmente `laravelVueNavigator.laravelPath` (vedi caso **C-01**).
- Verifica che esista `artisan` nel path indicato.

### 1.3 Impostazioni consigliate per la sessione “standard”

Usa questi valori come baseline; i casi specifici sovrascrivono dove indicato.

```json
{
  "laravelVueNavigator.laravelPath": "auto",
  "laravelVueNavigator.frontendPath": "auto",
  "laravelVueNavigator.apiBaseUrl": "",
  "laravelVueNavigator.phpBinary": "php",
  "laravelVueNavigator.useArtisan": true,
  "laravelVueNavigator.routeCacheTtl": 3600,
  "laravelVueNavigator.refreshDebounceMs": 500,
  "laravelVueNavigator.ambiguityStrategy": "pick",
  "laravelVueNavigator.ambiguityScope": "topScoreOnly"
}
```

### 1.4 Preparazione backend (route di test)

Sul progetto Laravel, assicurati di avere (o crea temporaneamente) route utili ai test:

| Route URI (esempio) | Metodo | Scopo test |
|---------------------|--------|------------|
| `/api/users` | GET | URL letterale |
| `/api/users/{id}` | GET | Parametro singolo |
| `/api/template/users` | GET | Ambiguità multi-segmento |
| `/api/route_book/users` | GET | Seconda rotta ambigua (stesso pattern strutturale) |
| `/api/{version}/orders` | GET | Due segmenti dinamici (se non esiste, usa le tue rotte equivalenti) |
| `/api/qa-smoke-test` | GET | Route nuova per test watcher (caso **W-01**) |

Annota i controller reali collegati a queste route: serviranno per verificare che il file PHP aperto sia quello giusto.

---

## 2. Riferimento rapido UI

### 2.1 Gesto di navigazione

- **macOS:** Cmd + Click sull’**URL** (stringa o template literal).
- **Windows / Linux:** Ctrl + Click sull’**URL**.

Il click deve cadere sull’argomento URL della chiamata axios, **non** su:

- il nome `axios` / `api`;
- l’oggetto `params`, `headers`, ecc.;
- variabili esterne all’URL.

### 2.2 Comandi palette

| Comando | Uso in QA |
|---------|-----------|
| `Laravel-Vue Navigator: Refresh routes` | Forza refresh cache route |
| `Laravel-Vue Navigator: Show route for endpoint under cursor` | Debug: notifica route matchata (non apre il file) |

### 2.3 Status bar (item `LVN`)

| Testo (circa) | Significato |
|---------------|-------------|
| `LVN: ready` | Avvio, in attesa |
| `$(sync~spin) LVN: refreshing` | Refresh in corso |
| `LVN: N routes (artisan)` | Cache aggiornata via Artisan |
| `LVN: N routes (static)` | Cache da parser statico |
| `$(warning) LVN: stale (N)` | Refresh fallito, cache precedente ancora usata — **click per retry** |
| `LVN: no routes` | Nessuna route in cache |

### 2.4 Output channel

In caso di FAIL, copia le ultime righe da **Laravel-Vue Navigator**, in particolare:

- `Using Laravel root: ...`
- `Ambiguous endpoint '...' (VERB): N candidate routes -> strategy=...`
- `ERROR: ...`
- `Using stale cache (N routes)`

---

## 3. Casi funzionali — Navigazione (Go to Definition)

Esegui con `ambiguityStrategy: pick` e `ambiguityScope: topScoreOnly` salvo diversa indicazione.

### 3.1 URL letterale

| ID | Passi | Atteso | Esito | Note |
|----|-------|--------|-------|------|
| **N-01** | In un `.vue`/`.ts`, `axios.get('/api/users')` (o path reale esistente). Ctrl+Click su `'/api/users'`. | Nessun QuickPick. Si apre il controller PHP corretto, cursore sul metodo (es. `index`). | | |
| **N-02** | Stesso test con `api.get(...)` o wrapper `http`/`client` se usati nel progetto. | Stesso comportamento di N-01. | | |
| **N-03** | `axios({ method: 'get', url: '/api/users' })`. Click sulla stringa `url`. | Pattern e verb estratti; navigazione come N-01. | | |
| **N-04** | URL con query: `axios.get('/api/users?active=1')`. | Match sulla path senza query; navigazione ok. | | |

### 3.2 Template literal — un parametro

| ID | Passi | Atteso | Esito | Note |
|----|-------|--------|-------|------|
| **N-10** | `` axios.get(`/api/users/${id}`) `` con almeno due route Laravel che matchano (es. lista + dettaglio). | Se **una sola** match migliore → jump diretto. Se **più** match a pari specificità → QuickPick (vedi N-20). | | |
| **N-11** | Click sul segmento statico del template (es. `/api/users`) non su `${id}`. | Comportamento coerente (estrazione dalla call expression che contiene il cursore). | | |

### 3.3 Template literal — ambiguità (QuickPick)

Prepara due rotte Laravel con stessa “forma” ma segmenti letterali diversi, es.:

- `GET /api/template/users`
- `GET /api/route_book/users`

Frontend:

```ts
const section = 'template'; // valore irrilevante per il parser
axios.get(`/api/${section}/users`);
```

| ID | Passi | Atteso | Esito | Note |
|----|-------|--------|-------|------|
| **N-20** | Ctrl+Click sull’URL del template. | Si apre **QuickPick** titolo *“Laravel-Vue Navigator: scegli la rotta”* con ≥2 voci. Ogni voce: `GET /uri/completa`, description `Controller@method`, detail path PHP relativo. | | |
| **N-21** | Dal QuickPick, seleziona la prima voce (click o Enter). | Si apre il file `.php` del controller scelto; cursore sulla riga `function ...`. | | |
| **N-22** | Ripeti N-20 e seleziona la **seconda** voce. | Si apre l’**altro** controller (non lo stesso file della voce 1, salvo che puntino allo stesso file). | | |

### 3.4 Template literal — due o più variabili

Esempio reale:

```ts
let route = 'orders';
const res = await axios.get(`/api/${apiVersion}/${route}`, {
  params: { page: 1 }
});
```

| ID | Passi | Atteso | Esito | Note |
|----|-------|--------|-------|------|
| **N-30** | Ctrl+Click sull’URL (template literal). | QuickPick con tutte le rotte Laravel compatibili con pattern tipo `/api/{param}/{param}` (o equivalente nel vostro progetto). | | |
| **N-31** | Seleziona una voce dal QuickPick. | Apertura file PHP + metodo corretto (**regressione fix `showTextDocument`**). | | |

### 3.5 Chiusura QuickPick senza navigare

| ID | Passi | Atteso | Esito | Note |
|----|-------|--------|-------|------|
| **N-40** | Apri QuickPick (caso ambiguo). Premi **Escape**. | Popup chiuso. **Nessun** file PHP aperto. Nessun errore in output. | | |
| **N-41** | Apri QuickPick. **Clic fuori** (editor, explorer, altro pannello). | Popup chiuso. Nessuna navigazione. | | |
| **N-42** | Apri QuickPick. Cambia **tab/editor** (apri un altro file) senza scegliere. | Popup chiuso o richiesta annullata. Nessun crash; nessuna navigazione spuria. | | |

### 3.6 Click fuori dall’URL

| ID | Passi | Atteso | Esito | Note |
|----|-------|--------|-------|------|
| **N-50** | Ctrl+Click su `axios` (nome funzione, non URL). | Nessuna navigazione (VS Code comportamento standard / nessuna definition). | | |
| **N-51** | Ctrl+Click su `params: { ... }` in `axios.get(url, { params })`. | Nessuna navigazione verso controller Laravel. | | |

### 3.7 File Vue

| ID | Passi | Atteso | Esito | Note |
|----|-------|--------|-------|------|
| **N-60** | Stesso test N-01 dentro `<script setup lang="ts">` di un `.vue`. | Navigazione ok (parser estrae solo il blocco script). | | |
| **N-61** | Click su URL in `<script lang="js">` se presente nel progetto. | Navigazione ok. | | |
| **N-62** | Click con cursore nel `<template>` o `<style>` (non nello script). | Nessuna navigazione (nessuno script alla posizione). | | |

---

## 4. Strategie di ambiguità (`ambiguityStrategy` / `ambiguityScope`)

Ripeti almeno un caso ambiguo (es. N-20) cambiando settings. **Ricarica finestra** o riapri file se le settings non si applicano subito.

### 4.1 `ambiguityStrategy`

| ID | Setting | Passi | Atteso | Esito | Note |
|----|---------|-------|--------|-------|------|
| **A-01** | `pick` (default) | Caso N-20 / N-30. | QuickPick → selezione → `showTextDocument` sul PHP. | | |
| **A-02** | `peek` | Stesso URL ambiguo, Ctrl+Click. | VS Code apre **Peek Definition** con più target (snippet codice). Nessun QuickPick custom. | | |
| **A-03** | `first` | Stesso URL ambiguo, Ctrl+Click. | Navigazione **immediata** al primo/best match **senza** popup. | | Verifica che non sia “a caso” l’ordine se due route hanno stesso score. |

### 4.2 `ambiguityScope`

Richiede URL che matchano sia rotte specifiche sia un eventuale catch-all (es. `/api/{any}/users`).

| ID | Setting | Passi | Atteso | Esito | Note |
|----|---------|-------|--------|-------|------|
| **A-10** | `topScoreOnly` | QuickPick su URL ambiguo. | Solo rotte con **score massimo** (no catch-all meno specifici se esistono match più specifici). | | |
| **A-11** | `allMatches` | Stesso URL. | QuickPick include **anche** rotte meno specifiche (es. catch-all), ordinate per score decrescente. | | |

---

## 5. Configurazione e monorepo

### 5.1 Path Laravel manuale

| ID | Passi | Atteso | Esito | Note |
|----|-------|--------|-------|------|
| **C-01** | Workspace **senza** `artisan` in root (solo in sottocartella, es. `backend/`). Imposta `"laravelVueNavigator.laravelPath": "backend"`. Riavvia o reload window. | Log: `Using Laravel root: .../backend`. Status bar con N route > 0. Ctrl+Click funziona. | | |
| **C-02** | Path errato (`"laravelPath": "non/esiste"`). | Estensione idle o nessuna route; log chiaro. Nessun crash IDE. | | |

### 5.2 `apiBaseUrl`

| ID | Passi | Atteso | Esito | Note |
|----|-------|--------|-------|------|
| **C-10** | Laravel: route registrata come `/api/users`. Frontend: `axios.get('/users')` **senza** `/api`. Setting `"apiBaseUrl": "/api"`. | Match su `/api/users`; navigazione al controller corretto. | | |
| **C-11** | Frontend già con `/api/users` e `apiBaseUrl: "/api"`. | Nessun doppio prefisso errato; match ancora corretto. | | |

### 5.3 `phpBinary`

| ID | Passi | Atteso | Esito | Note |
|----|-------|--------|-------|------|
| **C-20** | Se usi PHP non in PATH (es. MAMP, valet), imposta `"phpBinary": "/percorso/completo/php"`. Refresh routes. | Status `(... artisan)`, route aggiornate. | | |

---

## 6. Risoluzione route (Artisan vs static vs stale)

### 6.1 Artisan (default)

| ID | Passi | Atteso | Esito | Note |
|----|-------|--------|-------|------|
| **R-01** | `useArtisan: true`, PHP funzionante. Comando *Refresh routes*. | Status: `LVN: N routes (artisan)`. Notifica con conteggio route. | | |
| **R-02** | Confronta una route nota con output terminale: `php artisan route:list` nel `laravelRoot`. | URI e controller coerenti con l’estensione. | | |

### 6.2 Parser statico (senza PHP)

| ID | Passi | Atteso | Esito | Note |
|----|-------|--------|-------|------|
| **R-10** | `"laravelVueNavigator.useArtisan": false`. Refresh. | Status: `LVN: N routes (static)`. | | |
| **R-11** | Ctrl+Click su route definita in `routes/api.php` (sintassi semplice `Route::get(...)`). | Navigazione ok. | | |
| **R-12** | (Opzionale) Route registrata **solo** in ServiceProvider con logica condizionale complessa. | Può **non** comparire — limite noto; annotare N/A o FAIL atteso. | | |

### 6.3 Stale cache (errore PHP)

| ID | Passi | Atteso | Esito | Note |
|----|-------|--------|-------|------|
| **R-20** | Con cache già popolata, introduci **syntax error** in `routes/web.php` o `api.php` e salva. | Status: `LVN: stale (N)`. Tooltip invita a retry. Ctrl+Click **ancora** funziona sulle route vecchie in cache. | | |
| **R-21** | Correggi syntax error e salva. | Dopo debounce, status torna `(artisan)` o `(static)` con N aggiornato. | | |

---

## 7. File watcher e refresh automatico

Default `refreshDebounceMs: 500`.

| ID | Passi | Atteso | Esito | Note |
|----|-------|--------|-------|------|
| **W-01** | Aggiungi in `routes/api.php`: `Route::get('/api/qa-smoke-test', [TestController::class, 'index']);` (o closure/controller esistente). **Salva**. | Entro ~0,5–2 s: status passa da refreshing a ok; N route aumenta di 1 (o log refresh). | | |
| **W-02** | Nel frontend chiama `axios.get('/api/qa-smoke-test')` e Ctrl+Click. | Navigazione alla nuova action. | | |
| **W-03** | Modifica **solo** un file in `app/Http/Controllers/...` (refactor nome metodo, stesso URI). Salva. | Refresh scatta (conservativo); navigazione punta ancora al metodo se URI invariato. | | |
| **W-04** | Salva **rapidamente** 3 file PHP in sequenza (< 500 ms tra loro). | Un solo refresh effettivo (debounce), non tre spin consecutivi blocanti. | | |

---

## 8. Comandi e diagnostica

| ID | Passi | Atteso | Esito | Note |
|----|-------|--------|-------|------|
| **D-01** | Cursore su URL noto → *Show route for endpoint under cursor*. | Notifica con metodo HTTP, URI e action (es. `GET api/users -> Controller@method`). | | |
| **D-02** | Cursore su riga senza axios. | Messaggio: nessun endpoint rilevato. | | |
| **D-03** | URL senza match Laravel. | Warning: nessuna route matchata. | | |
| **D-04** | Click su item status bar `LVN: ...`. | Esegue refresh routes (come comando palette). | | |
| **D-05** | Caso ambiguo N-20: verifica output channel. | Riga log: `Ambiguous endpoint '...' (...): N candidate routes -> strategy=pick`. | | |

---

## 9. Casi negativi e limiti noti

Documentati come comportamento **atteso**, non bug.

| ID | Passi | Atteso | Esito | Note |
|----|-------|--------|-------|------|
| **L-01** | `const url = '/api/users'; axios.get(url);` — click su variabile `url`. | **Nessuna** navigazione (URL non letterale inline). | | Limite v0.1 |
| **L-02** | Route Laravel con action `Closure` senza controller. | Nessuna destinazione (provider ritorna undefined). | | |
| **L-03** | `fetch('/api/users')` invece di axios. | Nessuna integrazione. | | |
| **L-04** | Workspace senza `artisan` e `laravelPath` errato. | Estensione non naviga; nessun crash. | | |

---

## 10. Regressione release (smoke test minimo)

Da eseguire **sempre** prima di ogni tag / publish. Tempo stimato: 10–15 minuti.

| # | Caso ID | Descrizione breve | Esito |
|---|---------|-------------------|-------|
| 1 | N-01 | URL letterale → PHP | |
| 2 | N-31 | Template 2+ variabili → QuickPick → PHP | |
| 3 | N-40 | Escape → nessuna navigazione | |
| 4 | W-01 + W-02 | Nuova route salvata → navigabile | |
| 5 | R-01 | Refresh routes artisan ok | |

---

## 11. Matrice ambiente (opzionale, pre-release completo)

| Ambiente | N-01 | N-31 | N-40 | W-02 | Note |
|----------|------|------|------|------|------|
| VS Code + macOS | | | | | |
| VS Code + Windows | | | | | |
| Cursor + macOS | | | | | |
| Monorepo path manuale (C-01) | | | | | |
| Solo static parser (R-10) | | | | | |

---

## 12. Template segnalazione bug

Copia e compila in caso di FAIL:

```
**ID caso:** N-31
**Versione estensione:**
**VS Code / Cursor:**
**OS:**
**laravelPath / apiBaseUrl / ambiguityStrategy:**
**Snippet frontend:**
**Route Laravel attese:**
**Comportamento atteso:**
**Comportamento osservato:**
**Log output channel:**
**Screenshot:** (allegare)
```

---

## 13. Riferimenti

- [README](../README.md) — funzionalità e settings utente
- [PRESENTAZIONE_TECNICA.md](./PRESENTAZIONE_TECNICA.md) — architettura interna
- [CHANGELOG](../CHANGELOG.md) — versioni e note di rilascio

---

*Ultimo aggiornamento checklist: allineata a v0.1.1 (disambiguazione QuickPick, `showTextDocument`, settings `ambiguityStrategy` / `ambiguityScope`). Suite automatica: 48 test unitari; `npm run test:coverage` per soglie su `src/services/`.*
