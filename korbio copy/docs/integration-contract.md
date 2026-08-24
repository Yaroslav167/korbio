# Produktions-Schnittstellen für Korbio

Dieses Dokument beschreibt die kleinste sinnvolle Server-Schnittstelle, um den statischen MVP später mit echten Händlerdaten, Token-Guthaben und Zahlungen zu verbinden.

## Normalisiertes Händlerprodukt

```json
{
  "id": "dm-1453941",
  "retailerId": "dm",
  "retailerProductId": "1453941",
  "name": "dmBio Haferdrink Natur",
  "size": "1 l",
  "category": "Lebensmittel",
  "price": {
    "amountCents": 90,
    "currency": "EUR",
    "kind": "regular",
    "validFrom": "2026-08-14T00:00:00+02:00",
    "validUntil": null
  },
  "availability": {
    "status": "available",
    "postalCode": "10115",
    "storeId": null
  },
  "source": {
    "type": "official_page",
    "url": "https://www.dm.de/p/d/1453941/dmbio-pflanzendrink-haferdrink-natur",
    "checkedAt": "2026-08-14T15:00:00+02:00"
  }
}
```

Ein Preis darf in der App nur als „bestätigt“ erscheinen, wenn `source.url`, `source.checkedAt` und eine gültige Händlerfreigabe vorhanden sind. Regionale Preise benötigen außerdem Postleitzahl oder Markt-ID.

## Endpunkte

### `GET /api/catalog`

Parameter: `postalCode`, `retailer`, `category`, `query`, `cursor`.

Antwort: normalisierte Produkte plus `lastUpdatedAt` und Kennzeichnung der Datenquelle.

### `GET /api/family/session`

Liefert nach Anmeldung Rolle, gemeinsames Guthaben, Beitragsanfragen und Familienaufträge. Ohne gültige HttpOnly-Sitzung werden keine privaten Daten ausgegeben.

### `POST /api/family/topups`

Akzeptiert nur eine feste Paket-ID. Paketpreis und Token-Menge stammen aus der Serverkonfiguration. Der Server erzeugt eine einmalige Beitragsreferenz und speichert die Anfrage als offen. Eine optionale IBAN wird nur als Überweisungsziel angezeigt; ohne IBAN ist der Beitrag für Barzahlung vorgesehen.

### `POST /api/family/topups/:id/confirm`

Nur der Familienadmin kann einen geprüften Kontoeingang bestätigen. Statusänderung, Buchung und Gutschrift laufen in einer Transaktion und sind idempotent.

### `POST /api/family/orders`

Der Server nimmt nur Produkt-IDs, Mengen und Lieferdaten an. Er lädt alle Preise erneut aus dem eigenen Katalog, berechnet 10 Token Aufschlag pro Stück und zieht die Gesamtsumme innerhalb einer Datenbanktransaktion vom Guthaben ab. Preise, Gesamtsummen oder Guthaben aus dem Browser werden niemals vertraut.

### `PATCH /api/family/orders/:orderId/items/:itemId`

Aktualisiert den gemeinsamen Abhakstatus einer Position für alle angemeldeten Familienmitglieder.

## Preiskalkulation

```text
Produkt-Zwischensumme = Summe(Einzelpreis × Menge)
Serviceaufschlag       = Summe(Menge) × 0,10 €
Liefergebühr           = serverseitige Lieferregel
Token-Zahlbetrag       = Produkt-Zwischensumme + Serviceaufschlag + Liefergebühr
```

Die Produktionsversion muss zusätzlich Pfand, Gewichtsartikel, Ersatzartikel, Preisänderungen, Gutscheine, Storno und Teilerstattung abbilden.
