#!/usr/bin/env python3
"""
maj_veille.py — étape 1 du pipeline (Collecte) : lit les flux RSS/Atom des sources
de data/sources.js (champ "rss"), filtre par mots-clés d'horizon (data/config.js)
et écrit les nouveaux articles dans data/articles_auto.js au statut « Collecté ».

Aucune dépendance (bibliothèque standard uniquement).

Usage :
    python3 outils/maj_veille.py                 # 7 derniers jours
    python3 outils/maj_veille.py --jours 30      # fenêtre plus large (H3)
    python3 outils/maj_veille.py --simulation    # n'écrit rien, affiche le bilan

Ensuite : ouvrir le site, page « Actualités », trier / évaluer / publier.
Les adresses de flux (champ "rss") sont à vérifier : un flux en erreur est
simplement ignoré et signalé dans le bilan.
"""
import argparse, hashlib, html, json, re, sys, urllib.request
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path
import xml.etree.ElementTree as ET

DATA = Path(__file__).resolve().parent.parent / "data"
UA = {"User-Agent": "Mozilla/5.0 (veille-info; usage personnel)"}


def lire_js(nom):
    """Lit un fichier data/*.js de la forme « window.X = <JSON>; »."""
    txt = (DATA / nom).read_text(encoding="utf-8")
    txt = re.sub(r"^\s*/\*.*?\*/", "", txt, flags=re.S)
    debut = txt.index("=") + 1
    return json.loads(txt[debut:].strip().rstrip(";"))


def ecrire_auto(articles):
    entete = "/* articles_auto.js — généré par outils/maj_veille.py le %s */\nwindow.VEILLE_AUTO = " % datetime.now().strftime("%Y-%m-%d %H:%M")
    (DATA / "articles_auto.js").write_text(entete + json.dumps(articles, ensure_ascii=False, indent=1) + ";\n", encoding="utf-8")


def nettoyer(t, n=300):
    t = html.unescape(re.sub(r"<[^>]+>", " ", t or ""))
    t = re.sub(r"\s+", " ", t).strip()
    return t if len(t) <= n else t[: n - 1].rsplit(" ", 1)[0] + "…"


def date_item(e):
    for tag in ("pubDate", "{http://www.w3.org/2005/Atom}published", "{http://www.w3.org/2005/Atom}updated", "{http://purl.org/dc/elements/1.1/}date"):
        el = e.find(tag)
        if el is not None and el.text:
            try:
                d = parsedate_to_datetime(el.text)
            except Exception:
                try:
                    d = datetime.fromisoformat(el.text.strip().replace("Z", "+00:00"))
                except Exception:
                    continue
            return d if d.tzinfo else d.replace(tzinfo=timezone.utc)
    return None


def items_flux(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=20) as r:
        racine = ET.fromstring(r.read())
    atom = "{http://www.w3.org/2005/Atom}"
    for e in list(racine.iter("item")) + list(racine.iter(atom + "entry")):
        titre = (e.findtext("title") or e.findtext(atom + "title") or "").strip()
        lien = e.findtext("link") or ""
        if not lien:
            l = e.find(atom + "link")
            lien = l.get("href") if l is not None else ""
        desc = e.findtext("description") or e.findtext(atom + "summary") or e.findtext(atom + "content") or ""
        yield titre, lien.strip(), nettoyer(desc), date_item(e)


def horizon_pour(source, texte, mots):
    t = texte.lower()
    for h in source["h"]:
        for m in mots.get(h, []):
            if re.search(r"(?<!\w)" + re.escape(m.lower()) + r"(?!\w)", t):
                return h
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--jours", type=int, default=7)
    ap.add_argument("--simulation", action="store_true")
    args = ap.parse_args()

    sources = lire_js("sources.js")
    mots = lire_js("config.js")["motsCles"]
    existants = lire_js("articles.js")
    try:
        auto = lire_js("articles_auto.js")
    except Exception:
        auto = []
    urls = {a["url"] for a in existants + auto}
    limite = datetime.now(timezone.utc) - timedelta(days=args.jours)
    nouveaux, bilan = [], []

    for s in sources:
        if not s.get("rss"):
            continue
        try:
            vus = ajoutes = 0
            for titre, lien, desc, d in items_flux(s["rss"]):
                vus += 1
                if not titre or not lien.startswith("http") or lien in urls:
                    continue
                if d and d < limite:
                    continue
                h = horizon_pour(s, titre + " " + desc, mots)
                if not h:
                    continue
                urls.add(lien)
                nouveaux.append({
                    "id": "c" + hashlib.sha1(lien.encode()).hexdigest()[:8],
                    "date": (d or datetime.now(timezone.utc)).astimezone().strftime("%Y-%m-%d"),
                    "h": h, "titre": titre, "resume": desc or "(pas de résumé dans le flux)",
                    "url": lien, "source": s["id"], "importance": 0, "statut": "collecte", "objectif": "", "sf": False,
                })
                ajoutes += 1
            bilan.append((s["nom"], vus, ajoutes, ""))
        except Exception as ex:
            bilan.append((s["nom"], 0, 0, str(ex)[:70]))

    for nom, vus, aj, err in bilan:
        print("%-45s lus=%3d nouveaux=%3d %s" % (nom, vus, aj, ("ERREUR : " + err) if err else ""))
    print("\nTotal : %d nouveaux articles collectés (fenêtre %d jours)." % (len(nouveaux), args.jours))
    if args.simulation:
        print("Mode simulation : rien n'a été écrit.")
        return
    ecrire_auto((nouveaux + auto)[:500])
    print("data/articles_auto.js mis à jour — ouvrez le site pour trier ces articles.")


if __name__ == "__main__":
    sys.exit(main())
