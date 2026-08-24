# Korbio Token in der privaten Familie

## Feste Regeln

- 1 Token entspricht intern genau 0,01 €.
- 500 Token entsprechen 5,00 €, 1.500 Token 15,00 € und 5.000 Token 50,00 €.
- Es gibt keine Bonus-Token, Zinsen, Übertragungen oder automatische Auszahlungen.
- Produktpreis und 0,10 € Familienservice je Stück werden centgenau in Token umgerechnet.
- Das Guthaben ist nur die gemeinsame interne Abrechnung dieser Familie und kein öffentlich angebotenes Zahlungsmittel.

## Beitragsablauf

1. Ein angemeldetes Familienmitglied wählt ein festes Paket.
2. Der Server erzeugt eine einmalige Referenz und speichert den Beitrag als `pending`.
3. Das Familienmitglied gibt den Betrag bar an den Admin oder nutzt optional die angezeigte Überweisung.
4. Der Admin prüft den tatsächlichen Erhalt und bestätigt den Beitrag.
5. Eine SQLite-Transaktion setzt den Beitrag auf `confirmed`, schreibt die Buchung und erhöht das Guthaben genau einmal.

Eine IBAN ist nicht erforderlich. Eine doppelte Bestätigung verändert den Kontostand nicht erneut. Korbio speichert keine Karten- oder Online-Banking-Zugangsdaten.

## Auftragsablauf

Der Browser sendet nur Produkt-IDs, Mengen und Lieferdaten. Der Server lädt die eigenen Produktdatensätze, berechnet die Summe und 10 Cent je Stück neu und vertraut keinem vom Browser gesendeten Preis. Guthabenabzug, Buchungsjournal und Auftrag werden gemeinsam in einer SQLite-Transaktion gespeichert. Reicht das Guthaben nicht, wird der gesamte Auftrag abgelehnt.

## Rollen und Speicherung

- Das Familienpasswort erlaubt Einkauf, Beitragserstellung und das Abhaken von Aufträgen.
- Das getrennte Adminpasswort erlaubt zusätzlich Beitragsbestätigung und Korrekturbuchungen.
- Die Einrichtung speichert nur gesalzene Scrypt-Passworthashes.
- Sitzungen verwenden zufällige HttpOnly-Cookies und laufen nach 30 Tagen ab.
- Guthaben, Beiträge, Buchungen und Aufträge liegen in `data/family-wallet.sqlite`.

## Keine öffentliche Freigabe

Die private Familienausgestaltung ersetzt keine Prüfung für ein öffentliches Angebot. Ein gegen Euro ausgegebenes Guthaben kann je nach Gestaltung unter das Zahlungsdiensteaufsichtsgesetz fallen. Vor einer Öffnung für fremde Personen braucht das Projekt rechtliche und steuerliche Beratung, einen geeigneten Zahlungsdienstleister, Produktionshosting mit HTTPS, Nutzerverwaltung, Rückerstattungen, Kontosperren, Löschfristen und belastbare Händlerverträge.
