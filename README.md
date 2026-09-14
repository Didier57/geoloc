# Geoloc — suivi des déplacements via Home Assistant

Application web pour visualiser sur une carte les déplacements de plusieurs personnes, à partir
des entités de suivi de position de **Home Assistant** (toute entité exposant `latitude`/`longitude`).

- Page de connexion (utilisateurs locaux, rôles `user` / `admin`).
- Configuration de l'adresse Home Assistant + token d'accès longue durée, avec **test de connexion**.
- Sélection des entités géolocalisées à suivre, dans la fenêtre **Home Assistant** (admin) : seules
  celles cochées sont affichées.
- Carte **Leaflet + OpenStreetMap** (aucune clé API, gratuit).
- Sélection du jour (de 00:00 à 24:00) et affichage des trajets (historique via l'API Home Assistant).

## Architecture

```
web (React + Vite + Leaflet)  --/api-->  server (Node/Express)  --REST-->  Home Assistant
        nginx :80                        :4000                    /api/states, /api/history
```

Le serveur stocke les utilisateurs et la configuration Home Assistant dans un unique fichier JSON
persistant (`DATA_FILE`, monté sur un volume Docker). Le token Home Assistant y est chiffré
(AES-256-GCM) avec `COOKIE_ENC_KEY`.

Aucune base de données n'est nécessaire : l'historique des positions est lu directement auprès de
Home Assistant.

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
  la configuration de votre Home Assistant.
- Les entités `device_tracker` doivent exposer les attributs `latitude` / `longitude` (cas des
  trackers GPS / applications mobiles).
