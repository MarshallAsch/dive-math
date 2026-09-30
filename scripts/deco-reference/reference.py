"""Independent ZH-L16C + Baker-GF reference planner (clean-room, stdlib only).

Written from Bühlmann's and Baker's published equations — not from any other
planner — to cross-check dive-math/deco. Conventions match dive-math's
defaults: 1.0 ata surface, 10 m/bar, P_H2O 0.0627 bar, surface tissues
saturated at 0.7902 N2, whole-second stops (no minute rounding).

    python3 scripts/deco-reference/reference.py > test/fixtures/reference/schedules.json
"""
import json, math

# ZH-L16C, cpt 1 = "1b": (t½ N2, a N2, b N2, t½ He, a He, b He).
# Source: Bühlmann, Völlm & Nussberger, Tauchmedizin (2002), Tabelle 26 (N2);
# Baker, Understanding M-values (1998), Table 3 (He).
C = [(5.0, 1.1696, 0.5578, 1.88, 1.6189, 0.4770), (8.0, 1.0, 0.6514, 3.02, 1.3830, 0.5747),
     (12.5, 0.8618, 0.7222, 4.72, 1.1919, 0.6527), (18.5, 0.7562, 0.7825, 6.99, 1.0458, 0.7223),
     (27.0, 0.62, 0.8126, 10.21, 0.9220, 0.7582), (38.3, 0.5043, 0.8434, 14.48, 0.8205, 0.7957),
     (54.3, 0.441, 0.8693, 20.53, 0.7305, 0.8279), (77.0, 0.4, 0.8910, 29.11, 0.6502, 0.8553),
     (109.0, 0.375, 0.9092, 41.20, 0.5950, 0.8757), (146.0, 0.35, 0.9222, 55.19, 0.5545, 0.8903),
     (187.0, 0.3295, 0.9319, 70.69, 0.5333, 0.8997), (239.0, 0.3065, 0.9403, 90.34, 0.5189, 0.9073),
     (305.0, 0.2835, 0.9477, 115.29, 0.5181, 0.9122), (390.0, 0.261, 0.9544, 147.42, 0.5176, 0.9171),
     (498.0, 0.248, 0.9602, 188.24, 0.5172, 0.9217), (635.0, 0.2327, 0.9653, 240.03, 0.5119, 0.9267)]
WV, SURF, BAR_PER_M, N2_SAT = 0.0627, 1.0, 0.1, 0.7902
p = lambda d: SURF + d * BAR_PER_M

def schreiner(p0, pi0, r, t, half):
    k = math.log(2) / half
    return pi0 + r * (t - 1 / k) - (pi0 - p0 - r / k) * math.exp(-k * t)

class State:
    def __init__(s):
        s.n2 = [(SURF - WV) * N2_SAT] * 16; s.he = [0.0] * 16
    def copy(s):
        c = State(); c.n2 = s.n2[:]; c.he = s.he[:]; return c
    def seg(s, d0, d1, t, fo2, fhe):
        fn2 = 1 - fo2 - fhe; P0 = p(d0); rate = (p(d1) - P0) / t if t > 0 else 0
        for i, (tn, an, bn, th, ah, bh) in enumerate(C):
            s.n2[i] = schreiner(s.n2[i], (P0 - WV) * fn2, rate * fn2, t, tn)
            s.he[i] = schreiner(s.he[i], (P0 - WV) * fhe, rate * fhe, t, th)
    def tol(s, gf):
        m = 0
        for i, (tn, an, bn, th, ah, bh) in enumerate(C):
            P = s.n2[i] + s.he[i]; a = (an * s.n2[i] + ah * s.he[i]) / P; b = (bn * s.n2[i] + bh * s.he[i]) / P
            m = max(m, (P - a * gf) / (gf / b - gf + 1))
        return m

def plan(depth, bottom_min, bottom, deco, gfl, gfh, desc=20.0, asc=10.0, step=3, last=3, maxpp=1.6):
    st = State(); st.seg(0, depth, depth / desc, *bottom); st.seg(depth, depth, bottom_min, *bottom)
    gas = bottom; rt = depth / desc + bottom_min; d = depth; stops = []; first = None
    def gf_at(dd): return gfl if first is None else (gfh - (gfh - gfl) * min(dd, first) / first if first > 0 else gfh)
    def nxt(dd):
        if dd <= last: return 0
        r = math.floor(dd / step + 1e-9) * step
        return r if abs(r - dd) > 1e-9 else (dd - step if dd - step > last - 1e-9 else last)
    direct = st.copy(); direct.seg(d, 0, d / asc, *gas)
    if direct.tol(gfh) <= p(0) + 1e-12:  # within the NDL at GF-high: no stops
        return {'runtimeMinutes': round(rt + d / asc, 6), 'firstStopM': None, 'stops': []}
    while d > 0:
        c = [g for g in [gas] + deco if g[0] * p(d) <= maxpp + 1e-9]
        if c:
            g2 = max(c, key=lambda g: g[0])
            if g2[0] > gas[0]: gas = g2
        n = nxt(d)
        def ok(wait):
            s = st.copy()
            if wait > 0: s.seg(d, d, wait / 60, *gas)
            s.seg(d, n, (d - n) / asc, *gas)
            return s.tol(gf_at(n)) <= p(n) + 1e-12
        if not ok(0):
            if first is None: first = d
            if not ok(0):
                lo, hi = 0, 1
                while not ok(hi): lo, hi = hi, hi * 2
                while hi - lo > 1:
                    m = (lo + hi) // 2
                    if ok(m): hi = m
                    else: lo = m
                st.seg(d, d, hi / 60, *gas); rt += hi / 60; stops.append([d, hi])
        st.seg(d, n, (d - n) / asc, *gas); rt += (d - n) / asc; d = n
    return {'runtimeMinutes': round(rt, 6), 'firstStopM': first, 'stops': stops}

AIR, EAN50, O2 = (0.209, 0), (0.5, 0), (1.0, 0)
CASES = [
    ('air_18m_30min_gf40_85_no_deco', 18, 29.1, AIR, [], 0.4, 0.85),
    ('air_30m_25min_gf40_85', 30, 23.5, AIR, [], 0.4, 0.85),
    ('air_45m_30min_gf30_70', 45, 27.75, AIR, [], 0.3, 0.7),
    ('air_45m_30min_gf100_100', 45, 27.75, AIR, [], 1.0, 1.0),
    ('air_40m_30min_ean50_gf40_85', 40, 28, AIR, [EAN50], 0.4, 0.85),
    ('tx1845_60m_20min_ean50_o2_gf30_80', 60, 17, (0.18, 0.45), [EAN50, O2], 0.3, 0.8),
]
out = []
for name, depth, bottom_min, bottom, deco, gfl, gfh in CASES:
    out.append({'name': name, 'depthM': depth, 'bottomMinutes': bottom_min, 'bottom': list(bottom),
                'decoGases': [list(g) for g in deco], 'gfLow': gfl, 'gfHigh': gfh, **plan(depth, bottom_min, bottom, deco, gfl, gfh)})
print(json.dumps({'source': 'scripts/deco-reference/reference.py', 'cases': out}, indent=1))
