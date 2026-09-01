# Owl Soundboard

<p align="center">
  <img src="public/iconExtension.png" alt="Owl Soundboard icon" width="96" />
</p>

<p align="center">
  <strong>Une soundboard moderne pour Owlbear Rodeo, pensée pour déclencher des ambiances et effets sonores en pleine partie.</strong>
</p>

<p align="center">
  <a href="https://owl-soundboard-frontend.vercel.app/">Démo en ligne</a>
  ·
  <a href="https://www.owlbear.rodeo/">Owlbear Rodeo</a>
  ·
  <a href="public/manifest.json">Manifest d'extension</a>
</p>

<p align="center">
  <img alt="React" src="https://img.shields.io/badge/React-19-61dafb?logo=react&logoColor=101828">
  <img alt="Vite" src="https://img.shields.io/badge/Vite-6-646cff?logo=vite&logoColor=ffffff">
  <img alt="Tailwind CSS" src="https://img.shields.io/badge/Tailwind-CSS-38bdf8?logo=tailwindcss&logoColor=ffffff">
  <img alt="Owlbear SDK" src="https://img.shields.io/badge/Owlbear-SDK-7c3aed">
</p>

## Aperçu

<p align="center">
  <img src="src/assets/readme/soundboard-overview.png" alt="Owl Soundboard dans Owlbear Rodeo" width="900" />
</p>

Owl Soundboard s'intègre directement dans une salle Owlbear Rodeo sous forme de popover compact. Chaque room possède sa propre bibliothèque audio distante, avec quotas, upload direct, pré-écoute locale, favoris et arrêt global des sons actifs.

## Fonctionnalités

- **Lecture synchronisée dans Owlbear Rodeo** : un son déclenché par un utilisateur est diffusé aux autres participants via le SDK Owlbear.
- **Pré-écoute locale** : l'icône casque permet au MJ de tester un son sans le diffuser à la table.
- **Bibliothèque par room** : les sons sont isolés avec `OBR.room.id`.
- **Navigation par dossiers** : la bibliothèque audio conserve une structure de dossiers virtuelle dans la room.
- **Favoris rapides** : sons et dossiers peuvent être épinglés dans un panneau latéral.
- **Upload intégré** : ajout direct de fichiers audio via une URL signée vers Cloudflare R2.
- **Quotas visibles** : l'interface affiche l'espace utilisé, le nombre de fichiers et la taille max par fichier.
- **Suppression ciblée** : un son peut être supprimé sans effacer toute la room.
- **Contrôle local du volume** : mute, volume et arrêt global des sons actifs.
- **Mode standalone clair** : lorsqu'elle est ouverte hors Owlbear, l'app affiche un rappel d'intégration.

## Démo animée

<p align="center">
  <img src="src/assets/readme/soundboard-demo.gif" alt="Démonstration animée de Owl Soundboard" width="760" />
</p>

## Architecture

```mermaid
flowchart LR
  Frontend["Frontend React<br/>Owl Soundboard"] --> Backend["Backend serverless<br/>/api/sounds"]
  Backend --> R2["Cloudflare R2<br/>rooms/{roomId}"]
  Frontend --> Owlbear["Owlbear Rodeo<br/>Extension popover"]
  Owlbear --> Players["Joueurs<br/>Lecture synchronisée"]
```

Les fichiers audio ne sont pas stockés dans Owlbear. L'app utilise le SDK Owlbear pour synchroniser la lecture et le backend pour stocker les fichiers dans R2 par room.

## Stack

- React 19
- Vite 6
- Tailwind CSS
- Framer Motion
- Lucide React
- `@owlbear-rodeo/sdk`
- Vercel pour l'hébergement statique et les headers du manifest
- Cloudflare R2 côté backend pour les fichiers audio

## Démarrage local

### Prérequis

- Node.js 18 ou plus récent
- Un backend compatible avec `/api/sounds`

### Installation

```bash
npm install
```

### Lancer l'application

```bash
npm run dev
```

L'application sera disponible sur l'URL locale affichée par Vite, généralement `http://localhost:5173`.

### Build de production

```bash
npm run build
```

### Prévisualiser le build

```bash
npm run preview
```

## Configuration backend

Le frontend pointe actuellement vers :

```txt
https://owl-soundboard-backend.vercel.app/api/sounds
```

Tu peux remplacer cette URL avec une variable Vite :

```env
VITE_SOUND_API_URL=http://localhost:3000/api/sounds
VITE_TURNSTILE_SITE_KEY=votre_site_key_publique
```

Copie `.env.example` vers `.env.local` en developpement si tu veux pointer le
frontend vers ton backend local.

`VITE_TURNSTILE_SITE_KEY` est la cle **publique** du widget Cloudflare
Turnstile. La secret key reste uniquement dans les variables du backend. Le
widget se renouvelle automatiquement apres chaque modification de la
bibliotheque.

L'API doit accepter :

- `GET ?roomId=...&path=/` pour lister les dossiers et fichiers audio.
- `POST action=prepare_upload` pour recevoir une URL d'upload signée.
- `POST action=complete_upload` pour confirmer l'upload et sauvegarder l'audit.
- `POST action=create_folder` pour créer un dossier virtuel.
- `DELETE ?roomId=...&path=/file.mp3` pour supprimer un son précis.

Format attendu côté frontend pour la liste :

```json
[
  {
    "name": "Ambiance forêt.mp3",
    "url": "https://...",
    "path": "/ambiences/Ambiance forêt.mp3",
    "isFolder": false
  },
  {
    "name": "Combats",
    "path": "/combats",
    "isFolder": true
  }
]
```

## Installation dans Owlbear Rodeo

1. Déployer le frontend sur Vercel, Netlify ou un autre hébergeur statique.
2. Vérifier que `public/manifest.json` est accessible publiquement.
3. Dans Owlbear Rodeo, ouvrir la gestion des extensions.
4. Ajouter une extension personnalisée avec l'URL du manifest déployé.
5. Ouvrir l'extension dans une salle pour activer la synchronisation via le SDK Owlbear.

Le fichier `vercel.json` ajoute les headers CORS nécessaires pour que le manifest puisse être lu par Owlbear Rodeo.

## Limites connues

- Les quotas sont imposés côté backend par room.
- Les formats acceptés par l'interface sont `.mp3`, `.wav`, `.ogg`, `.opus`, `.m4a`, `.aac`, `.flac` et `.webm`.
- L'utilisateur doit confirmer qu'il possède les droits nécessaires avant l'upload.
- Hors Owlbear Rodeo, la lecture reste possible localement, mais la diffusion synchronisée dépend de l'environnement Owlbear.

## Structure

```txt
public/
  manifest.json        Manifest de l'extension Owlbear
  icon.png             Icône affichée dans Owlbear
  iconExtension.png    Icône principale du projet

src/
  App.jsx              Composition de l'interface
  hooks/               Logique de lecture, upload, favoris et SDK Owlbear
  components/          UI de la soundboard
  assets/              Captures utilisées dans le README
```

## Licence

Projet personnel maintenu par Olivier Poirier.
