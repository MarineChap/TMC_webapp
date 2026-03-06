# Guide d'Optimisation pour Raspberry Pi 4

Ce guide explique comment déployer et faire fonctionner cette application de manière optimale sur une Raspberry Pi 4 avec Node.js 20+.

## 1. Accès au Réseau Local

L'application est maintenant configurée pour être accessible via l'adresse IP de votre Raspberry Pi.

- **Vite (Dev)** : Utilise `host: true` pour écouter sur `0.0.0.0`.
- **Backend (Express)** : Utilise `app.listen(PORT, '0.0.0.0')`.

Pour trouver l'IP de votre Pi, tapez `hostname -I` dans le terminal de la Pi.
L'URL sera alors `http://<VOTRE_IP>:5173` en mode dev ou `http://<VOTRE_IP>:8001` en mode production.

## 2. Stratégie de Build Efficient

Pour éviter de surcharger les ressources (CPU/RAM) de la Raspberry Pi lors du build, voici les deux approches recommandées :

### Option A : Build sur un PC plus puissant (Recommandé)
Le build (Vite + TypeScript) consomme beaucoup de RAM. Il est plus efficace de builder sur votre ordinateur principal et de ne transférer que les fichiers compilés.

1. Sur votre PC :
   ```bash
   npm run build          # Compile le frontend dans dist/client
   npm run build:server   # Compile le backend dans dist/server
   ```
2. Transférez le dossier `dist`, `data`, `assets` et `package.json` sur la Pi (via `scp` ou clé USB).
3. Sur la Pi :
   ```bash
   npm install --production
   npm start
   ```

### Option B : Build sur la Pi avec SWAP
Si vous devez builder directement sur la Pi, assurez-vous d'avoir assez de mémoire virtuelle (swap) pour éviter les plantages de Node.

1. Augmentez le swap (ex: 2Go) :
   ```bash
   sudo nano /etc/dphys-swapfile
   # Changez CONF_SWAPSIZE=100 en CONF_SWAPSIZE=2048
   sudo /etc/init.d/dphys-swapfile restart
   ```
2. Lancez le build :
   ```bash
   npm run build
   npm run build:server
   ```

## 3. Exécution en Production

En production, n'utilisez pas `npm run dev` ou `tsx`. Utilisez Node directement sur les fichiers compilés pour économiser de la RAM et du CPU.

- **Démarrage direct** : `npm start` (lance `node dist/server/server.js`)
- **Gestionnaire de processus (PM2)** : Recommandé pour maintenir l'app active au reboot.
  ```bash
  sudo npm install -g pm2
  pm2 start dist/server/server.js --name "tmc-app"
  pm2 save
  pm2 startup
  ```

## 4. Docker (Optionnel)
La Raspberry Pi 4 gère très bien Docker. Vous pouvez créer une image légère basée sur `node:20-alpine` pour isoler les dépendances et faciliter le déploiement.

---
*Note : Cette configuration a été adaptée pour une performance maximale sur architecture ARM64.*
