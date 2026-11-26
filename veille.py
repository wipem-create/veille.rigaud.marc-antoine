#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
VEILLE.PY — Moteur de pilotage de la veille (H1 Cybersécurité / H2 IA / H3 SecOps)
===================================================================================
100 % bibliothèque standard Python (3.8+) : aucun "pip install" nécessaire.

Pipeline exécuté à chaque itération :
  1. COLLECTE      lecture des flux RSS/Atom de data/sources.json
  2. TRIAGE        dédoublonnage, classement H1/H2/H3, filtrage du bruit (promo, sponsor…)
  3. ÉVALUATION    score d'importance 0-100 (source, criticité, corroboration multi-sources)
  4. SIGNAUX       détection des signaux faibles (infos qui peuvent devenir importantes)
  5. PUBLICATION   à la une H1 (jour) / H2 (semaine lun→dim) / H3 (mois), KPI, archives

Commandes :
  python veille.py collect              collecte les flux + recalcule tout + régénère le site
  python veille.py build                recalcule uniquement (sans réseau)
  python veille.py import FICHIER.txt   importe une collecte manuelle (format "source ||| titre ||| lien ||| date ||| résumé")
  python veille.py auto                 mode automatique : 1re collecte à 7h puis toutes les 2h jusqu'à 19h (heure de Paris)
  python veille.py status               affiche les KPI de la dernière itération
"""
import csv, datetime as dt, email.utils, hashlib, html, json, os, re, sys, time, urllib.request
import xml.etree.ElementTree as ET

ROOT = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(ROOT, "data")
STORE = os.path.join(DATA, "store", "articles.json")
HISTORY = os.path.join(DATA, "store", "history.json")
FEEDLOG = os.path.join(DATA, "store", "feeds.json")
ARCHIVE = os.path.join(DATA, "archive")
EXPORT = os.path.join(DATA, "export")
UA = "Mozilla/5.0 (VeilleBot/1.0; +pilotage-veille)"
GARDER_JOURS_SITE = 62          # articles exportés vers le site
RESUME_MAX = 320                # ≈ 2-3 lignes

# ----------------------------------------------------------------------------- utilitaires
def lire_json(p, defaut):
    try:
        with open(p, encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return defaut

def ecrire_json(p, obj, indent=1):
    os.makedirs(os.path.dirname(p), exist_ok=True)
    tmp = p + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=indent)
    os.replace(tmp, p)

def maintenant_utc():
    return dt.datetime.now(dt.timezone.utc)

def _dernier_dimanche(annee, mois):
    d = dt.date(annee, mois + 1, 1) - dt.timedelta(days=1) if mois < 12 else dt.date(annee, 12, 31)
    return d - dt.timedelta(days=(d.weekday() + 1) % 7)

def vers_paris(d):
    """Heure de Paris sans dépendance (règle européenne CET/CEST)."""
    d = d.astimezone(dt.timezone.utc)
    debut = dt.datetime.combine(_dernier_dimanche(d.year, 3), dt.time(1), dt.timezone.utc)
    fin = dt.datetime.combine(_dernier_dimanche(d.year, 10), dt.time(1), dt.timezone.utc)
    off = 2 if debut <= d < fin else 1
    return d.astimezone(dt.timezone(dt.timedelta(hours=off)))

def parse_date(s):
    if not s:
        return None
    s = s.strip()
    try:
        d = email.utils.parsedate_to_datetime(s)
        if d.tzinfo is None:
            d = d.replace(tzinfo=dt.timezone.utc)
        return d.astimezone(dt.timezone.utc)
    except (TypeError, ValueError, IndexError):
        pass
    try:
        s2 = s.replace("Z", "+00:00")
        if re.fullmatch(r"\d{4}-\d{2}-\d{2}", s2):
            s2 += "T00:00:00+00:00"
        d = dt.datetime.fromisoformat(s2)
        if d.tzinfo is None:
            d = d.replace(tzinfo=dt.timezone.utc)
        return d.astimezone(dt.timezone.utc)
    except ValueError:
        return None

def nettoyer(txt):
    txt = html.unescape(re.sub(r"<[^>]+>", " ", txt or ""))
    txt = re.sub(r"\s+", " ", txt).strip()
    txt = re.sub(r"(The post|L'article|Cet article) .{0,160} (appeared first on|est apparu en premier sur).*$", "", txt)
    if len(txt) > RESUME_MAX:
        coupe = txt[:RESUME_MAX].rsplit(" ", 1)[0]
        txt = coupe.rstrip(",;:") + "…"
    return txt

def id_article(lien):
    l = re.sub(r"[?#].*$", "", (lien or "").strip().lower()).rstrip("/")
    l = re.sub(r"^https?://(www\.)?", "", l)
    return hashlib.sha1(l.encode()).hexdigest()[:12]

def regex_mots(liste):
    parts = []
    for k in liste:
        e = re.escape(k.lower())
        if len(k) <= 3 and k.isalpha():
            parts.append(r"(?<![\w])" + e + r"(?![\w])")
        else:
            parts.append(r"(?<![\w])" + e)
    return re.compile("|".join(parts))

# ----------------------------------------------------------------------------- 1. COLLECTE
def _local(tag):
    return tag.rsplit("}", 1)[-1].lower()

def lire_flux(url, timeout=25):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/rss+xml, application/atom+xml, application/xml, text/xml, */*"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        brut = r.read()
    racine = ET.fromstring(brut)
    items = []
    for el in racine.iter():
        if _local(el.tag) not in ("item", "entry"):
            continue
        it = {"titre": "", "lien": "", "date": "", "resume": ""}
        for c in el:
            n = _local(c.tag)
            if n == "title":
                it["titre"] = nettoyer("".join(c.itertext()))
            elif n == "link":
                href = c.get("href")
                if href and (c.get("rel") in (None, "alternate")):
                    it["lien"] = it["lien"] or href.strip()
                elif (c.text or "").strip():
                    it["lien"] = c.text.strip()
            elif n in ("pubdate", "published", "updated", "date", "issued") and not it["date"]:
                it["date"] = (c.text or "").strip()
            elif n in ("description", "summary") and not it["resume"]:
                it["resume"] = "".join(c.itertext())
            elif n == "encoded" and not it["resume"]:
                it["resume"] = "".join(c.itertext())
        if it["titre"] and it["lien"]:
            items.append(it)
    return items

def collecter(sources, store, iteration, journal):
    nouveaux = 0
    for s in sources:
        t0 = time.time()
        try:
            items = lire_flux(s["flux"])
            n = ajouter(store, s["id"], items, iteration)
            nouveaux += n
            journal[s["id"]] = {"ok": True, "items": len(items), "nouveaux": n, "quand": maintenant_utc().isoformat(), "duree_s": round(time.time() - t0, 1)}
            print(f"  [OK] {s['nom']:<38} {len(items):>3} items, {n:>3} nouveaux")
        except Exception as e:  # réseau, XML invalide, 404…
            journal[s["id"]] = {"ok": False, "erreur": str(e)[:160], "quand": maintenant_utc().isoformat()}
            print(f"  [KO] {s['nom']:<38} {str(e)[:70]}")
    return nouveaux

def ajouter(store, source_id, items, iteration, quand=None):
    n = 0
    quand = quand or maintenant_utc().isoformat()
    for it in items:
        aid = id_article(it["lien"])
        if aid in store:
            continue
        d = parse_date(it.get("date")) or parse_date(quand)
        store[aid] = {"id": aid, "source": source_id, "titre": nettoyer(it["titre"]), "lien": it["lien"].strip(),
                      "date": d.isoformat(), "resume": nettoyer(it.get("resume", "")),
                      "collecte": quand, "iteration": iteration}
        n += 1
    return n

def importer(fichier, store, iteration, journal, ids_sources):
    par_source, ko, quand = {}, [], None
    with open(fichier, encoding="utf-8") as f:
        for ligne in f:
            ligne = ligne.strip()
            if ligne.startswith("#!ko"):
                ko = ligne.split()[1:]
            elif ligne.startswith("#!date"):
                quand = parse_date(ligne.split(None, 1)[1]).isoformat()
            if not ligne or ligne.startswith("#"):
                continue
            p = [x.strip() for x in ligne.split("|||")]
            if len(p) < 4 or p[0] not in ids_sources:
                print("  ligne ignorée :", ligne[:80]); continue
            par_source.setdefault(p[0], []).append({"titre": p[1], "lien": p[2], "date": p[3], "resume": p[4] if len(p) > 4 else ""})
    quand = quand or maintenant_utc().isoformat()
    total = 0
    for sid, items in par_source.items():
        n = ajouter(store, sid, items, iteration, quand)
        total += n
        journal[sid] = {"ok": True, "items": len(items), "nouveaux": n, "quand": quand, "mode": "import"}
    for sid in ko:
        journal[sid] = {"ok": False, "erreur": "flux indisponible lors de la collecte", "quand": quand, "mode": "import"}
    print(f"  {total} articles importés depuis {os.path.basename(fichier)}")
    return total, quand

# ----------------------------------------------------------------------------- 2-4. TRIAGE, ÉVALUATION, SIGNAUX
STOP = set("""The A An And Or Of In On To For With From By After Before New How Why What Who When Where This That Its Is Are Was Were
Le La Les Un Une Des Du De Et Ou En Au Aux Pour Par Sur Dans Avec Sans Après Avant Comment Pourquoi Quand Qui Que Quoi Ce Cette Ces Son Sa Ses
Hackers Hacker Critical Flaw Flaws Security Cyber Data Attack Attacks Exploit Exploits New Microsoft Google Windows Linux Cloud AI IA Black Friday
Cybersécurité Cyberattaque Faille Failles Vulnérabilité Fuite Plus Moins Tout Tous Une Deux Trois US U.S. UK Agents Agent Les""".split())

def entites(texte):
    ents = set(m.upper() for m in re.findall(r"CVE-\d{4}-\d+", texte, re.I))
    for m in re.findall(r"\b([A-Z][A-Za-z0-9\-\.]{3,}|[A-Z]{3,}[a-z]*)\b", texte):
        m = m.strip(".")
        if m not in STOP and not m.isdigit() and len(m) >= 4:
            ents.add(m.lower())
    return ents

def analyser(store, sources, cfg, ref_utc):
    src = {s["id"]: s for s in sources}
    rx_h = {h: regex_mots(k) for h, k in cfg["mots_cles"].items()}
    crit = {h: [(re.compile(r"(?<![\w])(?:" + c["motif"] + ")"), c["points"]) for c in cfg["criticite"][h] + cfg["criticite"]["commun"]]
            for h in ("H1", "H2", "H3")}
    pen = re.compile(cfg["penalites"]["motif"])
    sous = {h: {n: re.compile(m) for n, m in d.items()} for h, d in cfg["sous_themes"].items()}
    sf = cfg["signaux_faibles"]
    rx_marq = re.compile(r"(?<![\w])(?:" + sf["marqueurs"] + ")")
    rx_suj = re.compile(r"(?<![\w])(?:" + sf["sujets_emergents"] + ")")
    seuil = cfg["seuils"]
    arts = list(store.values())

    # entités & corroboration (même sujet repris par d'autres sources)
    for a in arts:
        a["_txt"] = (a["titre"] + " " + a.get("resume", "")).lower()
        a["_ent"] = entites(a["titre"] + " " + a.get("resume", ""))
    df = {}
    for a in arts:
        for e in a["_ent"]:
            df.setdefault(e, set()).add(a["id"])
    par_id = {a["id"]: a for a in arts}
    for a in arts:
        autres = set()
        for e in a["_ent"]:
            ids = df[e]
            if 2 <= len(ids) <= 10:                    # entité discriminante (ni unique, ni banale)
                for i in ids:
                    if par_id[i]["source"] != a["source"] and abs((parse_date(par_id[i]["date"]) - parse_date(a["date"])).days) <= 7:
                        autres.add(par_id[i]["source"])
        a["corroboration"] = len(autres) + 1
        a["corrobore_par"] = sorted(autres)

    # fréquence documentaire des sujets émergents sur 30 jours
    debut30 = ref_utc - dt.timedelta(days=30)
    freq_suj = {}
    for a in arts:
        if parse_date(a["date"]) >= debut30:
            for t in set(x.strip() for x in rx_suj.findall(a["_txt"])):
                freq_suj[t] = freq_suj.get(t, 0) + 1

    for a in arts:
        s = src.get(a["source"], {})
        txt = a["_txt"]
        # --- classement horizon
        sc = {}
        for h, rx in rx_h.items():
            sc[h] = len(rx.findall(txt)) + (1.5 if h in s.get("objectif", []) else 0) + (1.0 if s.get("objectif", [None])[0] == h else 0)
        h1 = max(sc, key=lambda h: (sc[h], h == s.get("objectif", ["H1"])[0]))
        a["horizon"] = h1
        a["themes"] = sorted(h for h, v in sc.items() if len(rx_h[h].findall(txt)) > 0)
        a["sous_themes"] = sorted({f"{h}:{n}" for h in ("H1", "H2", "H3") for n, r in sous[h].items() if r.search(txt) and (h == h1 or h in a["themes"])})
        # --- score d'importance
        base = s.get("score_global", 7) * 4                         # 0-40
        pts, raisons = 0, []
        for r, p in crit[h1]:
            m = r.search(txt)
            if m:
                pts += p; raisons.append(m.group(0).strip())
        pts = min(pts, 40)
        corro = min((a["corroboration"] - 1) * 7, 20)
        malus = cfg["penalites"]["points"] if pen.search(txt) else 0
        score = max(0, min(100, round(base + pts + corro + malus)))
        a["score"] = score
        a["criteres"] = {"source": round(base, 1), "criticite": pts, "corroboration": corro, "bruit": malus, "motifs": raisons[:6]}
        a["retenu"] = score >= seuil["retenu"]
        a["une"] = score >= seuil["a_la_une"]
        a["flash"] = score >= seuil["flash"]
        # --- signal faible
        termes = sorted(set(t.strip() for t in rx_suj.findall(txt)))
        rares = [t for t in termes if freq_suj.get(t, 0) <= sf["frequence_max_terme"]]
        a["signal"] = bool(rares) and bool(rx_marq.search(txt)) and a["corroboration"] <= 1 \
            and s.get("credibilite", 0) >= sf["credibilite_min"] and not a["flash"] and malus == 0
        a["signal_termes"] = rares if a["signal"] else []
    for a in arts:
        a.pop("_txt", None); a.pop("_ent", None)

    # confirmation des signaux : le terme est-il repris ensuite par ≥ 2 autres sources ?
    for a in arts:
        if a["signal"]:
            d0 = parse_date(a["date"])
            suite = {b["source"] for b in arts if b["id"] != a["id"] and parse_date(b["date"]) > d0
                     and any(t in (b["titre"] + " " + b.get("resume", "")).lower() for t in a["signal_termes"])}
            a["signal_confirme"] = len(suite - {a["source"]}) >= 2
    return arts

# ----------------------------------------------------------------------------- scores des sources (partie automatique)
def noter_sources(sources, store, journal, cfg, ref_utc):
    w = lire_json(os.path.join(DATA, "sources.json"), {}).get("poids")
    d14 = ref_utc - dt.timedelta(days=14)
    for s in sources:
        arts = [a for a in store.values() if a["source"] == s["id"]]
        recents = [a for a in arts if parse_date(a["date"]) >= d14]
        j = journal.get(s["id"], {})
        # mises à jour : fraîcheur du dernier article
        if not j.get("ok", False) and not arts:
            maj = 0
        else:
            last = max((parse_date(a["date"]) for a in arts), default=None)
            age = (ref_utc - last).total_seconds() / 86400 if last else 999
            maj = 10 if age < 1 else 8 if age < 3 else 6 if age < 7 else 4 if age < 30 else 2
            if not j.get("ok", True):
                maj = max(0, maj - 3)                       # pénalité flux en erreur
        # fréquence de publication observée (articles / semaine sur 14 j)
        par_sem = len(recents) / 2
        freq = 10 if par_sem >= 20 else 9 if par_sem >= 10 else 7 if par_sem >= 5 else 5 if par_sem >= 2 else 3 if par_sem >= 1 else (1 if arts else 0)
        # pertinence : 50 % note experte + 50 % taux d'articles retenus (si échantillon ≥ 3)
        if len(recents) >= 3:
            taux = sum(1 for a in recents if a.get("retenu")) / len(recents)
            pert = round(0.5 * s["pertinence_base"] + 0.5 * taux * 10, 1)
        else:
            taux, pert = None, s["pertinence_base"]
        notes = {"credibilite": s["credibilite"], "veracite": s["veracite"], "pertinence": pert,
                 "frequence": freq, "lisibilite": s["lisibilite"], "mises_a_jour": maj}
        s["notes"] = notes
        s["score_global"] = round(sum(notes[k] * w[k] for k in w), 2)
        s["stats"] = {"articles_total": len(arts), "articles_14j": len(recents), "par_semaine": par_sem,
                      "taux_retenu": None if taux is None else round(taux * 100), "flux_ok": j.get("ok"),
                      "erreur": j.get("erreur"), "derniere_lecture": j.get("quand")}
    return sources

# ----------------------------------------------------------------------------- KPI
def bornes_periode(periode, ref_paris):
    d = ref_paris.date()
    if periode == "jour":
        return d, d
    if periode == "semaine":
        lun = d - dt.timedelta(days=d.weekday())
        return lun, lun + dt.timedelta(days=6)
    premier = d.replace(day=1)
    dernier = (premier + dt.timedelta(days=32)).replace(day=1) - dt.timedelta(days=1)
    return premier, dernier

def jour_paris(a):
    return vers_paris(parse_date(a["date"])).date()

def calculer_kpi(arts, sources, cfg, ref_utc):
    ref_p = vers_paris(ref_utc)
    k = cfg["kpi"]
    d7 = ref_utc - dt.timedelta(days=7)
    rec7 = [a for a in arts if parse_date(a["date"]) >= d7]
    # KPI1 — qualité moyenne des sources (pondérée par le nb d'articles retenus sur 7 j)
    poids = {}
    for a in rec7:
        if a["retenu"]:
            poids[a["source"]] = poids.get(a["source"], 0) + 1
    sc = {s["id"]: s["score_global"] for s in sources}
    kpi1 = round(sum(sc[i] * n for i, n in poids.items()) / max(1, sum(poids.values())), 2) if poids else 0
    kpi1_simple = round(sum(sc.values()) / len(sc), 2)
    actives = sum(1 for s in sources if s["stats"]["flux_ok"])
    # KPI2 — couverture des objectifs (sous-thèmes couverts sur la période propre à chaque horizon)
    cov = {}
    for h, conf in cfg["horizons"].items():
        per = "semaine" if conf["periode"] == "jour" else conf["periode"]      # H1 : couverture évaluée sur la semaine (fréquence hebdo)
        deb, fin = bornes_periode(per, ref_p)
        dans = [a for a in arts if a["retenu"] and deb <= jour_paris(a) <= fin]
        couverts = {n: sum(1 for a in dans if f"{h}:{n}" in a["sous_themes"]) for n in cfg["sous_themes"][h]}
        vd, vf = bornes_periode(conf["periode"], ref_p)
        vol = sum(1 for a in arts if a["retenu"] and a["horizon"] == h and vd <= jour_paris(a) <= vf)
        if conf["periode"] == "jour":       # moyenne / jour sur la semaine écoulée
            jours = max(1, (ref_p.date() - deb).days + 1)
            vol = round(sum(1 for a in dans if a["horizon"] == h) / jours, 1)
        cov[h] = {"periode": f"{deb.isoformat()} → {fin.isoformat()}", "sous_themes": couverts,
                  "taux": round(100 * sum(1 for v in couverts.values() if v) / len(couverts)),
                  "volume": vol, "objectif_volume": conf["objectif_volume"]["valeur"], "unite": conf["objectif_volume"]["unite"]}
    kpi2 = round(sum(c["taux"] for c in cov.values()) / len(cov))
    # KPI3 — signaux faibles détectés (7 derniers jours) + taux de confirmation (signaux de plus de 7 j)
    sig7 = [a for a in rec7 if a["signal"]]
    anciens = [a for a in arts if a["signal"] and parse_date(a["date"]) < d7]
    conf_rate = round(100 * sum(1 for a in anciens if a.get("signal_confirme")) / len(anciens)) if anciens else None

    def etat(v, cible, alerte):
        return "vert" if v >= cible else "orange" if v >= alerte else "rouge"
    return {
        "KPI1": {"valeur": kpi1, "moyenne_brute": kpi1_simple, "sources_actives": actives, "sources_total": len(sources),
                 "repartition": poids, "cible": k["KPI1"]["cible"], "etat": etat(kpi1, k["KPI1"]["cible"], k["KPI1"]["alerte"])},
        "KPI2": {"valeur": kpi2, "detail": cov, "cible": k["KPI2"]["cible"], "etat": etat(kpi2, k["KPI2"]["cible"], k["KPI2"]["alerte"])},
        "KPI3": {"valeur": len(sig7), "par_horizon": {h: sum(1 for a in sig7 if a["horizon"] == h) for h in ("H1", "H2", "H3")},
                 "taux_confirmation": conf_rate, "signaux_total": sum(1 for a in arts if a["signal"]),
                 "cible": k["KPI3"]["cible"], "etat": etat(len(sig7), k["KPI3"]["cible"], k["KPI3"]["alerte"])},
    }

# ----------------------------------------------------------------------------- 5. PUBLICATION
def publier(arts, sources, kpi, history, journal, cfg, ref_utc):
    ref_p = vers_paris(ref_utc)
    limite = ref_utc - dt.timedelta(days=GARDER_JOURS_SITE)
    garder = sorted([a for a in arts if parse_date(a["date"]) >= limite], key=lambda a: a["date"], reverse=True)
    champs = ("id", "source", "titre", "lien", "date", "resume", "horizon", "themes", "sous_themes", "score", "criteres",
              "retenu", "une", "flash", "signal", "signal_termes", "signal_confirme", "corroboration", "corrobore_par", "iteration", "collecte")
    out_arts = []
    for a in garder:
        o = {c: a.get(c) for c in champs}
        o["jour"] = jour_paris(a).isoformat()
        out_arts.append(o)
    dernier = history[-1] if history else {}
    site = {
        "genere_le": ref_utc.isoformat(), "genere_paris": ref_p.strftime("%d/%m/%Y %H:%M"), "jour_ref": ref_p.date().isoformat(),
        "iteration": dernier.get("n", 0), "config": {k: cfg[k] for k in ("horizons", "seuils", "kpi", "planification", "sous_themes")},
        "poids": lire_json(os.path.join(DATA, "sources.json"), {}).get("poids"),
        "sources": sources, "articles": out_arts, "kpi": kpi, "historique": history, "flux": journal,
    }
    ecrire_json(os.path.join(DATA, "site-data.json"), site, indent=None)
    with open(os.path.join(DATA, "site-data.js"), "w", encoding="utf-8") as f:
        f.write("/* Généré automatiquement par veille.py — ne pas modifier */\nwindow.VEILLE = ")
        json.dump(site, f, ensure_ascii=False)
        f.write(";\n")
    # archives journalières (stockage pour relecture ultérieure)
    jours = {}
    for a in arts:
        jours.setdefault(jour_paris(a).isoformat(), []).append({k: a.get(k) for k in champs})
    for j, lst in jours.items():
        ecrire_json(os.path.join(ARCHIVE, j[:7], f"{j}.json"), sorted(lst, key=lambda a: -a["score"]))
    # export CSV (tableur)
    os.makedirs(EXPORT, exist_ok=True)
    with open(os.path.join(EXPORT, "articles.csv"), "w", newline="", encoding="utf-8-sig") as f:
        wr = csv.writer(f, delimiter=";")
        wr.writerow(["date", "horizon", "source", "titre", "score", "retenu", "a_la_une", "signal_faible", "lien"])
        for a in sorted(arts, key=lambda a: a["date"], reverse=True):
            wr.writerow([a["date"][:16], a["horizon"], a["source"], a["titre"], a["score"], int(a["retenu"]), int(a["une"]), int(a["signal"]), a["lien"]])
    with open(os.path.join(EXPORT, "kpi_historique.csv"), "w", newline="", encoding="utf-8-sig") as f:
        wr = csv.writer(f, delimiter=";")
        wr.writerow(["iteration", "date", "collectes", "nouveaux", "retenus", "a_la_une", "flash", "signaux", "KPI1", "KPI2_%", "KPI3"])
        for h in history:
            wr.writerow([h["n"], h["date"], h["collectes"], h["nouveaux"], h["retenus"], h["une"], h["flash"], h["signaux"], h["kpi1"], h["kpi2"], h["kpi3"]])

# ----------------------------------------------------------------------------- orchestration
def executer(mode="collect", fichier=None, ref=None):
    cfg = lire_json(os.path.join(DATA, "config.json"), None)
    conf_src = lire_json(os.path.join(DATA, "sources.json"), None)
    if not cfg or not conf_src:
        sys.exit("config.json ou sources.json introuvable dans data/")
    sources = conf_src["sources"]
    store = lire_json(STORE, {})
    history = lire_json(HISTORY, [])
    journal = lire_json(FEEDLOG, {})
    n_iter = (history[-1]["n"] + 1) if history else 1
    ref_utc = ref or maintenant_utc()
    print(f"\n=== ITÉRATION {n_iter} — {vers_paris(ref_utc).strftime('%d/%m/%Y %H:%M')} (Paris) — mode {mode} ===")

    nouveaux = 0
    if mode == "collect":
        print("1. COLLECTE"); nouveaux = collecter(sources, store, n_iter, journal)
    elif mode == "import":
        print("1. COLLECTE (import)"); nouveaux, quand = importer(fichier, store, n_iter, journal, {s["id"] for s in sources})
        ref_utc = ref or parse_date(quand)
    # première passe pour avoir des scores de source, puis analyse, puis re-notation (pertinence observée)
    for s in sources:
        s.setdefault("score_global", round((s["credibilite"] + s["veracite"] + s["pertinence_base"] + s["lisibilite"]) / 4, 2))
    print("2-4. TRIAGE / ÉVALUATION / SIGNAUX")
    arts = analyser(store, sources, cfg, ref_utc)
    noter_sources(sources, store, journal, cfg, ref_utc)      # notes auto (fraîcheur, fréquence, pertinence observée)
    arts = analyser(store, sources, cfg, ref_utc)             # ré-évaluation avec les notes à jour
    noter_sources(sources, store, journal, cfg, ref_utc)
    for a in arts:
        store[a["id"]] = a
    kpi = calculer_kpi(arts, sources, cfg, ref_utc)
    if mode != "build" or not history:
        history.append({"n": n_iter, "date": ref_utc.isoformat(), "mode": mode, "collectes": len(store), "nouveaux": nouveaux,
                        "retenus": sum(1 for a in arts if a["retenu"] and a["iteration"] == n_iter),
                        "une": sum(1 for a in arts if a["une"] and a["iteration"] == n_iter),
                        "flash": sum(1 for a in arts if a["flash"] and a["iteration"] == n_iter),
                        "signaux": sum(1 for a in arts if a["signal"] and a["iteration"] == n_iter),
                        "sources_ok": sum(1 for s in sources if journal.get(s["id"], {}).get("ok")),
                        "sources_ko": sum(1 for s in sources if not journal.get(s["id"], {}).get("ok", False)),
                        "kpi1": kpi["KPI1"]["valeur"], "kpi2": kpi["KPI2"]["valeur"], "kpi3": kpi["KPI3"]["valeur"]})
    else:
        history[-1].update({"kpi1": kpi["KPI1"]["valeur"], "kpi2": kpi["KPI2"]["valeur"], "kpi3": kpi["KPI3"]["valeur"]})
    print("5. PUBLICATION")
    publier(arts, sources, kpi, history, journal, cfg, ref_utc)
    ecrire_json(STORE, store); ecrire_json(HISTORY, history); ecrire_json(FEEDLOG, journal)
    h = history[-1]
    print(f"   {h['collectes']} articles en base | {h['nouveaux']} nouveaux | {h['retenus']} retenus | {h['flash']} flash | {h['signaux']} signaux faibles")
    print(f"   KPI1 qualité sources = {kpi['KPI1']['valeur']}/10 ({kpi['KPI1']['etat']}) | KPI2 couverture = {kpi['KPI2']['valeur']} % ({kpi['KPI2']['etat']}) | KPI3 signaux 7j = {kpi['KPI3']['valeur']} ({kpi['KPI3']['etat']})")
    return kpi

def mode_auto():
    cfg = lire_json(os.path.join(DATA, "config.json"), {})
    p = cfg.get("planification", {"premiere_collecte": "07:00", "derniere_collecte": "19:00", "intervalle_heures": 2})
    h0, h1, pas = int(p["premiere_collecte"][:2]), int(p["derniere_collecte"][:2]), int(p["intervalle_heures"])
    creneaux = list(range(h0, h1 + 1, pas))
    print(f"Mode automatique : collectes à {', '.join(f'{h}h' for h in creneaux)} (heure de Paris). Ctrl+C pour arrêter.")
    fait = set()
    while True:
        now = vers_paris(maintenant_utc())
        cle = (now.date(), now.hour)
        if now.hour in creneaux and cle not in fait:
            try:
                executer("collect")
            except Exception as e:
                print("Erreur d'itération :", e)
            fait.add(cle)
        time.sleep(60)

if __name__ == "__main__":
    a = sys.argv[1:] or ["collect"]
    if a[0] == "collect":
        executer("collect")
    elif a[0] == "build":
        executer("build")
    elif a[0] == "import" and len(a) > 1:
        executer("import", a[1])
    elif a[0] == "auto":
        mode_auto()
    elif a[0] == "status":
        h = lire_json(HISTORY, [])
        print(json.dumps(h[-1] if h else {}, ensure_ascii=False, indent=2))
    else:
        print(__doc__)
