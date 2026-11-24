# Veille·Info — site de pilotage de la veille (H1 · H2 · H3)

Site statique rétro beige à bandes de couleur : aucune installation, aucun serveur obligatoire.

| Horizon | Thème | Itération | Publication sur le site |
|---|---|---|---|
| H1 | Cybersécurité | hebdomadaire | quotidienne (infos importantes de la journée) |
| H2 | IA | hebdomadaire | hebdomadaire, lundi → dimanche |
| H3 | SecOps | mensuelle | mensuelle, du 1er au 30 du mois |

## Ouvrir le site
- **Le plus simple** : double-clic sur `index.html` (fonctionne hors ligne, depuis n'importe quel dossier).
- **Avec un petit serveur local** : `outils/lancer.bat` (Windows) ou `outils/lancer.sh` (Mac/Linux).
- **Hébergement** : copier tout le dossier chez n'importe quel hébergeur statique (GitHub Pages, Netlify, OVH…).

## Contenu du dossier
```
index.html        Accueil : dernières nouvelles H1 / H2 / H3, éléments à surveiller, KPI
pipeline.html     Méthode en 5 étapes, entonnoir, rythme, grille d'importance, objectifs
actualites.html   Articles filtrables (thème, jour, étape), favoris, notes, ajout, sauvegarde
sources.html      25 sources notées /10 sur 6 critères (FR, Europe, International)
kpi.html          Fiches KPI1/2/3 (SMART), valeurs recalculées, historique, contrôle des données
assets/           style.css, app.js
data/             config.js (objectifs, seuils, cibles KPI, étapes) · sources.js · articles.js · articles_auto.js
outils/           maj_veille.py (collecte RSS) · lancer.bat · lancer.sh
```

## Faire vivre la veille à chaque itération
1. **Collecte** : `python3 outils/maj_veille.py` (ou `--jours 30` pour H3) ajoute les nouveaux articles au statut « Collecté » dans `data/articles_auto.js`. Les flux RSS (champ `rss` de `data/sources.js`) sont à vérifier ; un flux en erreur est ignoré et signalé.
2. **Triage → publication** : dans la page *Actualités*, changer l'étape, l'importance, l'objectif (O1…O9), le signal faible. Un article est publié sur l'accueil quand son étape est « Publié ».
3. **Sources** : ajuster les notes en *Mode édition* (page Sources).
4. **KPI** : rien à faire, ils se recalculent à partir des articles et des sources.
5. **Sauvegarde** : page *Actualités* → bas de page. « Sauvegarde .json » pour reprendre plus tard ; « articles.js » à glisser dans `data/` pour inscrire définitivement les modifications dans le dossier.

Les modifications faites dans le navigateur sont stockées localement (une copie de travail par navigateur) ; les fichiers de `data/` restent la référence.

## Définitions des KPI
- **KPI1 – Qualité moyenne des sources** = moyenne des scores (/10) des sources des articles retenus (« À surveiller » + « Publié »). Cible ≥ 7,5.
- **KPI2 – Couverture des objectifs** = objectifs couverts par ≥ 1 article retenu ÷ objectifs de l'horizon. Cible ≥ 80 %.
- **KPI3 – Signaux faibles détectés** = articles « signal faible » non rejetés sur la période. Cible ≥ 2 par semaine (H1, H2), ≥ 3 par mois (H3).

Seuils, objectifs et textes de méthode : `data/config.js` (à aligner sur le fichier Excel de Teams).

## Limites à connaître
- Les notes des sources et les importances sont une **première évaluation** à valider.
- Les relevés antérieurs à la semaine S47 sont partiels (« n/d » = aucune itération).
- Certains liens pointent vers la page d'accueil d'une source (articles consultés sur une page d'actualité en direct).
