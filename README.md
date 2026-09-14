# Geoloc — suivi des déplacements via Home Assistant

Application web pour visualiser sur une carte les déplacements de plusieurs personnes, à partir
des entités de suivi de position de **Home Assistant** (toute entité exposant `latitude`/`longitude`).

- Page de connexion (utilisateurs locaux, rôles `user` / `admin`).
- Configuration de l'adresse Home Assistant + token d'accès longue durée, avec **test de connexion**.
- Sélection des entités géolocalisées à suivre, dans la fenêtre **Home Assistant** (admin) : seules
  celles cochées sont affichées.
- Carte **Leaflet + OpenStreetMap** (aucune clé API, gratuit).
- Sélection du jour (de 00:00 à 24:00), navigation jour précédent/suivant, et affichage des trajets
  (archivés localement, sinon lus en direct depuis Home Assistant).
- **Une seule entité affichée à la fois** dans la fenêtre principale : cliquer sur une personne la
  sélectionne et désélectionne les autres. Le choix est mémorisé par compte et restauré à la
  reconnexion.
- **Analyse marche / voiture** : chaque point est classé d'après la vitesse calculée entre deux
  positions successives. Le tracé prend la couleur correspondante (vert à pied, rouge en voiture,
  gris immobile) et de petites **flèches** indiquent le sens de déplacement.
- **Arrêts sur place** : un repère violet signale les lieux où la personne est restée (rayon 200 m
  pendant au moins 5 min) ; au clic, l'adresse et la plage horaire de l'arrêt s'affichent.
- **Mode sombre / clair** : bouton lune/soleil en haut à droite du bandeau, préférence mémorisée
  dans le navigateur (suit le thème du système par défaut).

## Architecture

```
web (React + Vite + Leaflet)  --/api-->  server (Node/Express)  --REST-->  Home Assistant
        nginx :80                        :4000                    /api/states, /api/history
```

Le serveur stocke les utilisateurs et la configuration Home Assistant dans un unique fichier JSON
persistant (`DATA_FILE`, monté sur un volume Docker). Le token Home Assistant y est chiffré
(AES-256-GCM) avec `COOKIE_ENC_KEY`.

Aucune base de données externe n'est nécessaire : l'**historique des positions** est archivé par le
serveur dans des fichiers JSON journaliers, à côté de `DATA_FILE` (dossier `history/`), sur le même
volume Docker.

## Archivage automatique de l'historique

Home Assistant ne conserve qu'un nombre limité de jours d'historique (8 jours par défaut dans le
*recorder*). Pour ne rien perdre, le serveur archive automatiquement chaque jour :

- **Tous les jours à 00:00** (fuseau `TZ`, `Europe/Paris` par défaut), le serveur télécharge et
  enregistre les positions de la veille pour les entités sélectionnées.
- **Au démarrage**, il rattrape les `ARCHIVE_BACKFILL_DAYS` derniers jours (8 par défaut) s'ils ne
  sont pas déjà archivés.
- **Manuellement**, le bouton « Synchroniser » force la mise à jour de la base pour les jours
  couverts par le rattrapage, puis recharge les entités et la carte.

Lors d'une recherche sur la page d'accueil, le serveur interroge **d'abord la base locale** ; si le
jour n'est pas archivé (par exemple aujourd'hui), il interroge **Home Assistant** ; si aucune donnée
n'existe, la page affiche « Pas de données pour cette date. ».

## Analyse des déplacements (marche / voiture)

À l'import, chaque point est analysé en fonction de l'heure et de la position du point précédent :
la vitesse est calculée (distance par la formule de Haversine ÷ temps écoulé) et le déplacement est
classé :

| Vitesse | Mode | Couleur du tracé |
| --- | --- | --- |
| < `STILL_MAX_KMH` (2 km/h) | Immobile | gris |
| entre `STILL_MAX_KMH` et `WALK_MAX_KMH` (8 km/h) | À pied | vert |
| > `WALK_MAX_KMH` | En voiture | rouge |

Des **flèches** sont placées régulièrement sur le tracé pour indiquer le sens de déplacement. Le
détail (mode et vitesse) apparaît dans l'infobulle d'un point.

### Arrêts sur place

Lorsque plusieurs points successifs restent dans un rayon de **200 m** pendant au moins **5 minutes**,
un **repère violet** (épingle) est affiché sur la carte. Cliquez dessus pour voir le **lieu**
(adresse géocodée) et la **plage horaire** de l'arrêt (de … à …) avec sa durée.

## Prérequis

- Un Home Assistant accessible depuis le serveur.
- Un **token d'accès de longue durée** : dans Home Assistant, cliquez sur votre profil
  (en bas à gauche) → onglet « Sécurité » → « Jetons d'accès longue durée » → « Créer un jeton ».

## Configuration

Copiez `.env.example` en `.env` et renseignez au minimum :

| Variable | Description |
| --- | --- |
| `APP_URL` | URL publique de l'app (ex. `https://geoloc.exemple.fr` ou `http://localhost:8080`) |
| `SESSION_SECRET` | Chaîne aléatoire longue (signature des cookies de session) |
| `COOKIE_ENC_KEY` | 64 caractères hexadécimaux (chiffrement du token HA) |
| `ADMIN_USERNAME` | Nom du compte admin créé au premier démarrage |
| `ADMIN_EMAIL` | Email de l'admin (optionnel) |
| `ADMIN_PASSWORD` | Mot de passe de l'admin (8 caractères min) |
| `TZ` | Fuseau horaire du serveur (`Europe/Paris` par défaut) |
| `ARCHIVE_BACKFILL_DAYS` | Jours rattrapés depuis Home Assistant au démarrage (8 par défaut) |
| `STILL_MAX_KMH` | Vitesse sous laquelle le device est considéré immobile (2 par défaut) |
| `WALK_MAX_KMH` | Vitesse sous laquelle un déplacement est « à pied », au dessus « en voiture » (8 par défaut) |
| `GEOLOC_IMAGE_TAG` | Tag des images GHCR (`latest` par défaut) |

Sous Linux/macOS, générez une clé avec : `openssl rand -hex 32`.

## Démarrage

### Avec les images publiées (GHCR)

```bash
cp .env.example .env
# éditez .env
docker compose up -d
```

L'application est disponible sur `http://localhost:8080`.

### En développement

```bash
# Terminal 1 — API
cd server
npm install
SERVER_PORT=4000 SESSION_SECRET=dev COOKIE_ENC_KEY=dev ADMIN_PASSWORD=admin12345 node src/index.js

# Terminal 2 — Front
cd web
npm install
npm run dev
```

Le front de développement tourne sur `http://localhost:5173` et proxifie `/api` vers le serveur.

## Utilisation

1. Connectez-vous avec le compte admin défini dans `.env`.
2. Cliquez sur **Home Assistant**, saisissez l'adresse (`http://hôte:8123`) et le token, puis
   **Tester**, puis **Enregistrer**.
3. Dans la section **Entités à afficher**, cochez les entités géolocalisées à suivre puis cliquez sur
   **Enregistrer la sélection**. Seules ces entités apparaîtront ensuite dans la fenêtre principale.
4. Choisissez le jour pour afficher les trajets sur la carte.
5. Le bouton **Utilisateurs** permet de gérer les comptes (admin uniquement).

## Publication des images

Le workflow `.github/workflows/publish.yml` construit et publie automatiquement les images sur
GitHub Container Registry à chaque push sur `main` (et sur les tags `v*`) :

- `ghcr.io/didier57/geoloc-server`
- `ghcr.io/didier57/geoloc-web`

## Notes

- L'API Home Assistant renvoie l'historique conservé dans le **recorder** ; la profondeur dépend de
  la configuration de votre Home Assistant (8 jours par défaut). L'archivage quotidien du serveur
  permet de conserver l'historique au-delà de cette limite.
- Les entités `device_tracker` doivent exposer les attributs `latitude` / `longitude` (cas des
  trackers GPS / applications mobiles).
