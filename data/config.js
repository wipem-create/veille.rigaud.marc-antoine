/* config.js — données de la veille (JSON valide après « = »). Modifiable à la main. */
window.VEILLE_CONFIG = {
 "titre": "Veille·Info — Pilotage",
 "version": "1.0",
 "horizons": {
  "H1": {
   "nom": "Cybersécurité",
   "theme": "Cybersécurité",
   "periode": "semaine",
   "frequence": "Hebdomadaire",
   "publication": "Quotidienne : infos importantes de la journée",
   "seuilPublication": 3
  },
  "H2": {
   "nom": "Intelligence artificielle",
   "theme": "IA",
   "periode": "semaine",
   "frequence": "Hebdomadaire",
   "publication": "Hebdomadaire : infos les plus importantes de la semaine (lundi → dimanche)",
   "seuilPublication": 4
  },
  "H3": {
   "nom": "SecOps",
   "theme": "SecOps",
   "periode": "mois",
   "frequence": "Mensuelle",
   "publication": "Mensuelle : infos vraiment importantes du 1er au 30 du mois",
   "seuilPublication": 4
  }
 },
 "objectifs": [
  {
   "id": "O1",
   "h": "H1",
   "label": "Vulnérabilités critiques / exploitées"
  },
  {
   "id": "O2",
   "h": "H1",
   "label": "Incidents, fuites et chaîne d'approvisionnement"
  },
  {
   "id": "O3",
   "h": "H1",
   "label": "Alertes et bulletins officiels (CERT-FR, CISA, ANSSI)"
  },
  {
   "id": "O4",
   "h": "H2",
   "label": "Modèles, agents et produits IA"
  },
  {
   "id": "O5",
   "h": "H2",
   "label": "Réglementation et géopolitique de l'IA (AI Act, puces)"
  },
  {
   "id": "O6",
   "h": "H2",
   "label": "Sécurité et risques de l'IA"
  },
  {
   "id": "O7",
   "h": "H3",
   "label": "Plateformes SIEM / XDR / EDR et marché"
  },
  {
   "id": "O8",
   "h": "H3",
   "label": "SOC agentique et automatisation"
  },
  {
   "id": "O9",
   "h": "H3",
   "label": "Gestion des vulnérabilités et pratiques SOC"
  }
 ],
 "kpi": {
  "kpi1": {
   "cible": 7.5
  },
  "kpi2": {
   "cible": 0.8
  },
  "kpi3": {
   "cible": {
    "H1": 2,
    "H2": 2,
    "H3": 3
   }
  }
 },
 "statuts": {
  "collecte": "Collecté",
  "trie": "Trié",
  "lu": "Lu & évalué",
  "important": "À surveiller",
  "publie": "Publié",
  "rejete": "Rejeté"
 },
 "importance": [
  {
   "n": 5,
   "nom": "Critique",
   "def": "Exploitation active et produit très répandu, ou décision à prendre immédiatement."
  },
  {
   "n": 4,
   "nom": "Important",
   "def": "Impact fort sur le périmètre suivi ; à publier dès le seuil atteint."
  },
  {
   "n": 3,
   "nom": "Notable",
   "def": "Utile à connaître, impact limité ou confirmation attendue."
  },
  {
   "n": 2,
   "nom": "Mineur",
   "def": "Contexte ou info faible, à garder si signal faible."
  },
  {
   "n": 1,
   "nom": "Anecdotique",
   "def": "Hors cœur de cible, conservé pour mémoire ou rejeté."
  },
  {
   "n": 0,
   "nom": "Non évalué",
   "def": "Article collecté, pas encore lu."
  }
 ],
 "etapes": [
  {
   "n": 1,
   "nom": "Collecte",
   "but": "Rassembler largement, sans juger.",
   "actions": [
    "Flux RSS et pages officielles (CERT-FR, CISA, éditeurs) via outils/maj_veille.py",
    "Newsletters et agrégateurs de veille quotidiens ou hebdomadaires",
    "Recherches web ciblées par mots-clés pour chaque horizon (H1, H2, H3)",
    "Ajout manuel d'un article depuis la page Actualités"
   ],
   "regles": [
    "La source figure dans le tableau Sources (sinon l'évaluer d'abord)",
    "Date de publication ≤ 7 jours (H1/H2) ou ≤ 30 jours (H3)"
   ],
   "sortie": "Article au statut « Collecté », importance 0"
  },
  {
   "n": 2,
   "nom": "Triage",
   "but": "Décider vite de ce qui mérite d'être lu.",
   "actions": [
    "Dédoublonner (même URL ou même événement)",
    "Écarter le hors-périmètre et les contenus promotionnels",
    "Vérifier date, source et lien",
    "Affecter l'horizon (H1/H2/H3) et l'objectif visé"
   ],
   "regles": [
    "Règle des 30 secondes : titre + chapô suffisent pour décider",
    "Contenu purement commercial → Rejeté"
   ],
   "sortie": "Article « Trié » ou « Rejeté »"
  },
  {
   "n": 3,
   "nom": "Lecture & évaluation",
   "but": "Comprendre, vérifier, noter.",
   "actions": [
    "Lire l'article et recouper avec une seconde source si l'impact est fort",
    "Noter l'importance de 1 à 5 (grille ci-dessous)",
    "Rédiger le résumé en 2 à 3 lignes",
    "Marquer les signaux faibles"
   ],
   "regles": [
    "Importance = impact × exposition × fiabilité de la source",
    "Signal faible = info peu relayée mais à fort potentiel"
   ],
   "sortie": "Article « Lu & évalué » avec note et résumé"
  },
  {
   "n": 4,
   "nom": "Infos qui peuvent devenir importantes",
   "but": "Garder sous surveillance ce qui n'est pas encore décisif.",
   "actions": [
    "Placer en liste « À surveiller » les infos de faible importance mais à fort potentiel",
    "Réévaluer à chaque itération : promotion vers Publié ou abandon"
   ],
   "regles": [
    "Promotion si : exploitation active confirmée, CVSS ≥ 9, ajout au catalogue CISA KEV, ou 2 sources fiables concordantes",
    "Abandon si rien de neuf après 2 itérations"
   ],
   "sortie": "Article « À surveiller »"
  },
  {
   "n": 5,
   "nom": "Suivi & partage",
   "but": "Publier au bon rythme et mesurer.",
   "actions": [
    "H1 : publication des infos importantes de la journée sur le site",
    "H2 : publication des infos les plus importantes de la semaine, du lundi au dimanche",
    "H3 : publication des infos vraiment importantes du 1er au 30 du mois",
    "Recalcul des KPI, mise à jour du tableau Sources, sauvegarde du dossier"
   ],
   "regles": [
    "Seuils de publication : H1 ≥ 3, H2 ≥ 4, H3 ≥ 4 (modifiables dans data/config.js)",
    "Un article publié garde son lien vers la source d'origine"
   ],
   "sortie": "Article « Publié » sur l'accueil et dans les actualités"
  }
 ],
 "motsCles": {
  "H1": [
   "vulnérabilité",
   "faille",
   "cve",
   "ransomware",
   "exploit",
   "zero-day",
   "cyberattaque",
   "fuite de données",
   "data breach",
   "malware",
   "phishing",
   "patch",
   "cisa",
   "backdoor"
  ],
  "H2": [
   "intelligence artificielle",
   "ia",
   "llm",
   "gpt",
   "claude",
   "gemini",
   "mistral",
   "ai act",
   "agent",
   "openai",
   "anthropic",
   "artificial intelligence",
   "ai"
  ],
  "H3": [
   "soc",
   "siem",
   "xdr",
   "edr",
   "soar",
   "secops",
   "threat hunting",
   "detection and response",
   "splunk",
   "sentinel",
   "crowdstrike",
   "sentinelone",
   "wazuh",
   "mdr"
  ]
 }
};
