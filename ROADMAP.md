# Roadmap

Liste de suggestions d'amélioration pour geoloc. Coche au fur et à mesure.

## Fait

- [x] 8. Auto-nommer les arrêts récurrents (lieux mémorisés)
- [x] 2. Import Home Assistant incrémental (delta depuis le dernier point connu)
- [x] 3. Suivi de progression des jobs de fond (archivage / nettoyage)
- [x] 10. Stats déplacées dans le paquet `shared/` (source unique)
- [x] 4. Recherche d'adresse / lieu sur la carte (géocodage direct + zoom)
- [x] 5. Déduplication robuste à l'import (5 s / 50 m, re-import Google)
- [x] 7. Alertes Home Assistant si HA injoignable ou aucune synchro depuis N jours
- [x] 8. Robustesse SQLite : sauvegarde automatique + restauration depuis les JSON
- [x] 9. Carte de chaleur des zones les plus visitées
- [x] 10. Journal d'activité dans l'UI (dernières synchros, échecs, imports)

## À faire

_(rien pour l'instant)_

## Idées non retenues pour l'instant

- 1. Nettoyage automatique des archives anciennes (rétention configurable)
- 2. Réglages admin dans l'UI (ARCHIVE_BACKFILL_DAYS, rétention, purge)
- 3. Stats multi-jours (agrégation semaine/mois, comparaison de périodes)
- 6. Gestion des sessions / utilisateurs (déconnexion à distance, renommage)
