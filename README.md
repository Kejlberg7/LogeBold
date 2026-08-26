# LogeBold

Logens regnskab for Premier League-sæsonen. Hvert medlem har to hold, og hver gang
et hold spiller uafgjort eller taber, kommer der penge i kassen. Siden viser kamp
for kamp, hvem der skylder hvad, og hvor meget der er sparet op.

## Sådan regnes der

Alt er én kassebog. Hver linje har en dato, et medlem, et beløb og en grund:

| Type | Hvor kommer den fra | Fortegn |
| --- | --- | --- |
| Kamp | Automatisk, når kampen er spillet | Medlemmet skylder |
| Bøde | Admin | Medlemmet skylder |
| Indbetaling | Admin, når pengene er modtaget | Kredit |
| Regulering | Admin, ved rettelser | Begge veje |

- Satserne for uafgjort og nederlag sættes pr. sæson under **Satser og sæson**.
  Ændrer du dem, regnes alle åbne måneder om med det samme.
- Deler flere medlemmer det samme hold, betaler de hver især.
- En udsat eller aflyst kamp koster ikke noget, før den er spillet.
- Manuelle posteringer slettes aldrig — de modposteres, så historikken står.
- En **lukket måned** kan ikke ændres. Hverken nye satser eller en genberegning
  rører den. Åbn den igen, hvis der skal rettes.

## Hvem kan se hvad

Alle sider undtagen `/admin` er åbne. Man behøver ikke logge ind for at se
kassen, kampene, stillingen eller den enkeltes regnskab — link til siden er nok.
Kun admin logger ind, og kun admin kan registrere betalinger, give bøder og
ændre satser. Loginkoden er derfor den eneste rigtige hemmelighed: den, der har
en admin-kode, kan flytte penge i regnskabet.

## Kør lokalt

Kræver Node 20 og en lokal Postgres.

```bash
createdb logebold
cp .env.example .env.local   # udfyld DATABASE_URL og SESSION_SECRET
npm install
npm run db:push              # opretter tabellerne
npm run seed                 # testdata: sæson, hold, medlemmer, spillede runder
npm run dev
```

`npm run seed` skriver loginkoderne i terminalen. Den nægter at køre mod andet
end en lokal database, medmindre du skriver `--force`.

## Miljøvariabler

| Navn | Bruges til |
| --- | --- |
| `DATABASE_URL` | Postgres. I produktion: Neons *pooled* connection string. |
| `SESSION_SECRET` | Underskriver login-cookien. Mindst 32 tilfældige tegn. |
| `FOOTBALL_DATA_TOKEN` | Gratis nøgle fra [football-data.org](https://www.football-data.org/client/register). |
| `CRON_SECRET` | Beskytter `/api/cron/sync`. Vercel sender den selv som `Authorization: Bearer`. |

## Sæt i drift

1. **Database:** opret et projekt på [neon.tech](https://neon.tech), kopiér den
   *pooled* connection string.
2. **Hosting:** importér repoet på [vercel.com](https://vercel.com) og sæt de fire
   miljøvariabler. Gem dem som almindelige (krypterede) variabler — *Secret*-typen
   udleveres ikke til bygningen. `vercel.json` starter det natlige synk kl. 03.30.
   Projektet er forbundet til GitHub, så hvert push til `main` ruller ud af sig selv.
3. **Tabeller:** kør `npm run db:push` med produktionens `DATABASE_URL`.
4. **Domæne:** tilføj `loge.kejlberg.it` i Vercel, og opret hos one.com en
   CNAME-record med hostname `loge`, der peger på den værdi Vercel viser.
5. **Første login:** på en tom database beder `/login` dig oprette dig som admin.
   Derefter: hent kampene under **Måneder og synk** og fordel holdene under
   **Medlemmer og hold**.

## Kommandoer

| Kommando | Gør |
| --- | --- |
| `npm run dev` | Udviklingsserver |
| `npm run build` | Produktionsbuild |
| `npm run db:push` | Opdaterer databasens tabeller efter skemaændringer |
| `npm run db:studio` | Drizzle Studio |
| `npm run seed` | Testdata (kun lokalt) |
| `npm run recalc` | Genberegner kampopkrævninger |
