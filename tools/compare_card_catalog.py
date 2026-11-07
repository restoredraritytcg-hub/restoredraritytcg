"""Compare a freshly built card list with the live one, for the scheduled update.

    python tools/compare_card_catalog.py portal/cards.json /tmp/cards.json

Prints GitHub Actions outputs:
  changed=true|false    true when the new list has different sets or cards (the date stamp alone doesn't count)
  summary=<text>        e.g. "+128 cards, 1 new set (Pitch Black)"
Exits with an error (so nothing is committed) if the new list looks broken, e.g. TCGdex
was down and returned far fewer cards than before.
"""
import json, sys

old_path, new_path = sys.argv[1], sys.argv[2]
old = json.load(open(old_path, encoding="utf-8"))
new = json.load(open(new_path, encoding="utf-8"))

o_cards, n_cards = len(old.get("cards", [])), len(new.get("cards", []))
o_sets, n_sets = len(old.get("sets", [])), len(new.get("sets", []))

# Safety: a partial download must never replace a good list.
if n_cards < 1000 or n_cards < o_cards * 0.95 or n_sets < o_sets - 3:
    sys.exit(f"New card list looks incomplete ({n_cards:,} cards in {n_sets} sets vs {o_cards:,} in {o_sets} now). Not updating.")

changed = old.get("sets") != new.get("sets") or old.get("cards") != new.get("cards")
old_ids = {s[0] for s in old.get("sets", [])}
added = [s[1] for s in new.get("sets", []) if s[0] not in old_ids]
parts = [f"{n_cards - o_cards:+,} cards"]
if added:
    parts.append(f"{len(added)} new set{'s' if len(added) > 1 else ''} ({', '.join(added[:5])}{'…' if len(added) > 5 else ''})")
summary = ", ".join(parts) + f" — {n_cards:,} cards in {n_sets} sets"
print(f"changed={'true' if changed else 'false'}")
print(f"summary={summary}")
