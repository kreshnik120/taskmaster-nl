

# DIAG-9: Vergelijk positie-telling vs dienst-telling

## Actie
Eén read-only SQL query uitvoeren via `psql`: `SUM(gevraagd_aantal)` per dag voor ingeplande diensten (week 23-29 maart). Vergelijk met Bendy UI tellingen (ma=17, di=20, wo=19, do=24, vr=20, za=30, zo=20).

Als `posities` matcht met Bendy, is de conclusie: Bendy telt posities (gevraagd_aantal), niet unieke diensten. De frontend moet dan `SUM(gevraagd_aantal)` gebruiken i.p.v. `COUNT(*)`.

Geen wijzigingen, alleen lezen.

