# VEILLE//INFO — Outil de pilotage de veille (H1 · H2 · H3)

Site web rétro + moteur Python qui **collecte, trie, note, stocke et publie** automatiquement la veille :

| Horizon | Thème | Fréquence | Publié sur le site |
|---|---|---|---|
| **H1** | Cybersécurité | Hebdomadaire, collecte quotidienne dès **7h** puis toutes les 2 h jusqu'à 19h | Infos importantes **du jour** (+ onglet semaine) |
| **H2** | Intelligence artificielle | Hebdomadaire | Infos les plus importantes de la **semaine (lun → dim)** |
| **H3** | SecOps | Mensuelle | Infos vraiment importantes **du mois (1 → 30)** |

Aucune dépendance : **Python 3.8+ uniquement** (bibliothèque standard). Fonctionne sous Windows, macOS, Linux et sur n'importe quel hébergeur statique.

---

## 1. Démarrage rapide

```bash
python serve.py            # ouvre http://localhost:8080 et collecte automatiquement à 7h, 9h, … 19h
```
Windows : double-cliquez `planification/1_lancer_site.bat`.

### Collecter depuis le site, sans commande (bouton « Mode hors-ligne » → « En ligne »)

1. Sur GitHub : **Settings → Pages → Source = GitHub Actions** et **Settings → Actions → General → Workflow permissions = Read and write**.
2. Créez un jeton *fine-grained* (github.com/settings/personal-access-tokens/new) limité au dépôt, avec **Actions : Read and write**.
3. Sur le site, cliquez **○ Mode hors-ligne**, collez le jeton, **▶ Activer** → le bouton devient **● En ligne · ▶ Collecter**.
4. Chaque clic lance une collecte sur GitHub Actions (1 à 2 min), puis la page se recharge avec les nouvelles news.

Le jeton est stocké uniquement dans votre navigateur ; les visiteurs du site restent en « Mode hors-ligne ». Le bouton **⚙** permet de changer ou retirer le jeton.
Si `serve.py` tourne, le bouton passe en **● Local · ▶ Collecter** et collecte sur votre PC.

## 2. Commandes du moteur

```bash
python veille.py collect             # 1 itération : collecte RSS → triage → score → signaux → KPI → site
python veille.py build               # recalcule tout sans réseau (après modif. de config.json / sources.json)
python veille.py import fichier.txt  # importe une collecte manuelle (format : source ||| titre ||| lien ||| date ||| résumé)
python veille.py auto                # boucle : collectes à 7h puis toutes les 2 h jusqu'à 19h (heure de Paris)
python veille.py status              # résumé de la dernière itération
```

## 3. Avoir des news chaque jour dès 7h (même site fermé)

Choisissez **une** option :

- **Windows** : lancez une fois `planification/3_installer_tache_windows.bat` → tâche planifiée 7h00, répétée toutes les 2 h pendant 12 h.
- **macOS / Linux** : `sh planification/installer_cron_mac_linux.sh` → crontab `0 7-19/2 * * *`.
- **En ligne (GitHub, gratuit)** : poussez le dossier dans un dépôt GitHub, réglez *Settings → Pages → Source* sur **GitHub Actions**.
  Le workflow `.github/workflows/veille.yml` collecte à 7h, 9h… 19h (heure de Paris, été/hiver gérés), enregistre les données dans le dépôt et publie le site.
- **Autre hébergeur** (OVH, Netlify, serveur perso…) : copiez le dossier et planifiez `python veille.py collect` avec le cron de l'hébergeur.

Les collectes de la journée ajoutent les nouveaux articles ; ceux dont le score ≥ 80 apparaissent en **⚡ FLASH** sur l'accueil dès la collecte suivante.

## 4. Stockage (pour reprendre plus tard)

```
data/
├── sources.json            référentiel des 28 sources + notes expertes (à ajuster)
├── config.json             seuils, mots-clés, sous-thèmes, objectifs, cibles KPI, planning
├── store/articles.json     base complète de tous les articles collectés (jamais purgée)
├── store/history.json      historique des itérations et des KPI
├── store/feeds.json        état de chaque flux (OK/KO, erreur)
├── archive/AAAA-MM/AAAA-MM-JJ.json   archive par jour, triée par importance
├── export/articles.csv     export tableur (Excel : séparateur « ; »)
├── export/kpi_historique.csv
├── import/                 collectes manuelles (itération n°1)
└── site-data.js / .json    données lues par le site (régénérées à chaque itération)
```
Sauvegarder la veille = copier le dossier `data/`.

## 5. Pages du site

1. **Accueil** — à la une H1 (jour/semaine), H2 (semaine), H3 (mois), bandeau flash, tuiles KPI, signaux faibles, rythme.
2. **Pipeline** — la méthode en 5 étapes (Collecte → Triage → Lecture & évaluation → Infos qui peuvent devenir importantes → Suivi & partage) avec les compteurs réels de la dernière itération, formule du score, planning, journal des itérations.
3. **Actus live** — une case par article (titre, résumé 2-3 lignes, lien), filtres par **jour** et par **thème**, tri, recherche.
4. **Sources** — tableau des 28 sources (10 FR, 5 EU, 13 internationales) : site, objectif H1/H2/H3, type, mises à jour, crédibilité, lisibilité, fréquence, véracité, pertinence, **score /10**.
5. **Fiches KPI** — définition, formule, critères SMART, seuils de contrôle et détail recalculé pour KPI1, KPI2, KPI3 + courbe d'évolution.

## 6. Comment les valeurs sont calculées

- **Score d'article (0-100)** = note source × 4 + critères de criticité propres à l'horizon (≤ 40) + corroboration × 7 (≤ 20) − bruit (35). Retenu ≥ 45, à la une ≥ 65, flash ≥ 80.
- **Score source /10** = crédibilité 25 % + véracité 20 % + pertinence 20 % + fréquence 15 % + lisibilité 10 % + mises à jour 10 %.
  *Mises à jour*, *fréquence* et la moitié de *pertinence* (taux d'articles retenus) sont **mesurées automatiquement**.
- **KPI1** qualité moyenne des sources, pondérée par les articles retenus sur 7 j — cible ≥ 7,5/10.
- **KPI2** couverture des objectifs : % de sous-thèmes couverts par horizon (H1/H2 semaine, H3 mois) — cible ≥ 80 %.
- **KPI3** signaux faibles détectés sur 7 j glissants (+ taux de confirmation) — cible ≥ 3/semaine.

Toutes les cibles et seuils sont modifiables dans `data/config.json` (ex. pour les aligner sur le document KPI et le fichier de fréquence de Teams), puis `python veille.py build`.

## 7. Itération n°1 (26/11/2026)

192 articles réels collectés sur 21 flux → 80 retenus, 5 flash, 5 signaux faibles.
KPI1 = 8,04/10 · KPI2 = 100 % · KPI3 = 5.
Points d'action relevés : flux CERT-FR déplacé (404, nouvelle URL à vérifier sur cert.cyber.gouv.fr/flux-rss), volume H2 (11/10 semaine) correct mais H3 sous l'objectif mensuel (7/8), 7 flux non lus lors de la 1re collecte (à revérifier à la prochaine itération locale).
