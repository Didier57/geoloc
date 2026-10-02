# Roadmap

Liste de suggestions d'amélioration pour geoloc. Coche au fur et à mesure.

## Fait

- [x] 8. Auto-nommer les arrêts récurrents (lieux mémorisés)
- [x] 2. Import Home Assistant incrémental (delta depuis le dernier point connu)
- [x] 3. Suivi de progression des jobs de fond (archivage / nettoyage)
- [x] 10. Stats déplacées dans le paquet `shared/` (source unique)

## À faire (lot en cours : 4, 5, 7, 8, 9, 10)

- [ ] 4. Recherche d'adresse / lieu sur la carte (géocodage direct + zoom)
- [ ] 5. Déduplication robuste à l'import (re-import Google, timestamps en double)
- [ ] 7. Alertes Home Assistant si HA injoignable ou aucune synchro depuis N jours
- [ ] 8. Robustesse SQLite : fallback JSON auto si la base ne s'ouvre pas + sauvegarde périodique
- [ ] 9. Carte de chaleur des zones les plus visitées
- [ ] 10. Journal d'activité dans l'UI (dernières synchros, échecs, imports)

## Idées non retenues pour l'instant

- 1. Nettoyage automatique des archives anciennes (rétention configurable)
- 2. Réglages admin dans l'UI (ARCHIVE_BACKFILL_DAYS, rétention, purge)
- 3. Stats multi-jours (agrégation semaine/mois, comparaison de périodes)
- 6. Gestion des sessions / utilisateurs (déconnexion à distance, renommage)
