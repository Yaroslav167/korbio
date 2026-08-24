# Korbio – private Familienkasse

Korbio ist eine installierbare Einkaufs-Web-App für die eigene Familie. Sie verbindet einen großen Produktkatalog, einen gemeinsamen Warenkorb, ein serverseitiges Familienguthaben und eine nach Shops sortierte Einkaufsliste. Pro gekauftem Stück werden transparent 0,10 € aufgeschlagen.

## Was funktioniert

- responsive App für iPhone, Tablet und Desktop
- REWE, Lidl, ALDI, EDEKA, Kaufland, PENNY, Netto, dm, Rossmann, Amazon, OTTO, MediaMarkt, IKEA und Zalando
- mehr als 6.000 öffentlich belegte Preisbeobachtungen samt Quelle und Datum
- Suche, Händler- und Kategoriefilter sowie Preissortierung
- Warenkorb über mehrere Shops und exakt 0,10 € Aufschlag pro Stück
- private Anmeldung mit getrenntem Familien- und Adminpasswort
- gemeinsame, dauerhafte SQLite-Datenbank für Token, Buchungen und Aufträge
- Familienbeiträge bar oder optional per Banküberweisung mit eindeutiger Referenz
- Gutschrift erst nach manueller Bestätigung durch den Familienadmin
- atomare Abbuchung: Ein Auftrag kann das Guthaben nie unter null bringen
- abhaktbare, nach Händler gruppierte Einkaufsliste auf allen angemeldeten Geräten
- autorisierter JSON-/CSV-Katalogimport und eigener Support-Bereich

Die App bestellt noch nicht automatisch bei REWE, Amazon oder anderen Händlern. Sie erstellt einen internen Familienauftrag und eine Einkaufsliste. Eine echte Händlerbestellung benötigt für jeden Shop einen offiziellen Vertrag oder eine freigegebene API.

## Einmalig einrichten

1. `Korbio einrichten.command` doppelt anklicken.
2. Für Barzahlung die optionale IBAN-Abfrage einfach mit Enter überspringen. Nur für Überweisungen Kontoinhaber und echte IBAN eingeben.
3. Ein Familienpasswort und ein anderes, längeres Adminpasswort festlegen.
4. Danach `Korbio starten.command` doppelt anklicken.
5. Im Browser unter `http://localhost:4173` mit Name und Passwort anmelden.

Die Passwörter werden als gesalzene Scrypt-Hashes in `.env` abgelegt. Die lokale Datenbank liegt in `data/family-wallet.sqlite`; diese beiden Dateien werden nicht in Git aufgenommen. Für eine Sicherung sollten beide Dateien regelmäßig auf ein verschlüsseltes Backup kopiert werden.

## Familienbeitrag und Token

1 Token entspricht 0,01 €. Die festen Pakete sind 500 Token für 5,00 €, 1.500 Token für 15,00 € und 5.000 Token für 50,00 €.

Ein Familienmitglied wählt ein Paket. Korbio zeigt Betrag und eine einmalige Referenz. Ohne IBAN wird der Beitrag bar an den Familienadmin gegeben. Ist eine IBAN hinterlegt, kann alternativ außerhalb der App überwiesen werden. Der Admin bestätigt den Beitrag erst nach dem tatsächlichen Erhalt. Erst dann schreibt die Datenbank die Token genau einmal gut.

Korbio benötigt keine IBAN und greift nicht auf ein Bankkonto zu. Es speichert keine Kartennummer, PIN, CVC oder Online-Banking-Zugangsdaten. Für Barbeiträge fällt keine Zahlungsanbietergebühr an; mögliche Bankgebühren bei der optionalen Überweisung hängen vom vorhandenen Kontomodell ab.

Weitere technische Regeln stehen in [docs/TOKEN-SYSTEM.md](docs/TOKEN-SYSTEM.md).

## Auf dem iPhone verwenden

Für Geräte im selben privaten WLAN kann `Korbio im Heimnetz starten.command` verwendet werden. Das Terminal zeigt die Adresse, zum Beispiel `http://192.168.1.20:4173`. Diese Adresse in Safari öffnen. Diese einfache Heimnetz-Variante nur im eigenen vertrauenswürdigen WLAN verwenden und den Mac währenddessen laufen lassen.

Für Zugriff außerhalb des eigenen WLANs braucht Korbio eine private HTTPS-Adresse, etwa über einen eigenen VPN-/Tunnelzugang. Erst über HTTPS funktionieren PWA-Sicherheitsfunktionen und die Installation zuverlässig. Danach in Safari: Teilen → „Zum Home-Bildschirm“.

## Automatisch im Hintergrund starten

`Korbio 24-7 aktivieren.command` richtet einen persönlichen macOS-Hintergrunddienst ein. Korbio startet danach bei jeder Anmeldung automatisch und wird nach einem Absturz neu gestartet. `Korbio 24-7 deaktivieren.command` entfernt diesen Hintergrundstart wieder.

Die lokale Variante ist nur erreichbar, solange der Mac eingeschaltet und angemeldet ist. Im Tiefschlaf oder bei ausgeschaltetem Mac kann kein lokaler Server erreichbar sein. Echte Erreichbarkeit rund um die Uhr erfordert einen ständig laufenden Rechner oder später ein HTTPS-Hosting.

## Preise und Grenzen

Die großen Lebensmittelkataloge stammen aus [Open Prices / Open Food Facts](https://prices.openfoodfacts.org/) und stehen unter der [Open Database License](https://opendatacommons.org/licenses/odbl/1-0/). Jeder belegte Eintrag zeigt Markt, Datum und Quelle. Preisbeobachtungen sind nicht automatisch der heutige Preis jeder Filiale. Nicht angebundene Werte sind sichtbar als „Demo-Preis“ gekennzeichnet.

Für Amazon, OTTO, MediaMarkt und IKEA enthält der Support-Bereich offizielle Anbindungswege und einen Import für autorisierte Feeds. Die App erfindet keine angeblich echten Shoppreise und kopiert Shopseiten nicht ungefragt.

## Entwicklung und Tests

Mit dem mitgelieferten Node.js oder einer eigenen Node-Version ab 22:

```bash
npm run check
npm test
npm start
```

Die Tests prüfen unter anderem Produktdaten, Cent-Berechnung, Tokenumrechnung, einmalige Beitragsbestätigung, atomare Abbuchung und Abhakstatus.

## Wichtige Grenze

Diese Version ist bewusst nur als private interne Familienkasse gebaut. Sie ist kein öffentliches Bezahlsystem. Werden Token später an fremde Personen verkauft oder öffentlich bei mehreren Shops eingesetzt, müssen Zahlungsdienstleister, Verbraucherrecht, Datenschutz, Steuern und mögliche E-Geld-Pflichten vorab professionell geprüft und die Architektur entsprechend erweitert werden.
