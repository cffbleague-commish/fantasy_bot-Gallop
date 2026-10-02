#!/usr/bin/env python3
"""Local mock of DevyDraftWebApp.gs for testing the widget offline.

Speaks the same contract as the real Apps Script endpoint (GET ?feed=devy&fid=,
POST {action:...}) and mutates in-memory state so picks / retention / skip /
auto-pick actually change the board. No Google/MFL needed.

    python mock-server.py
    # then open in a browser (widget lives one dir up, in MFL Website Design/):
    #   ../home-message-devy-draft.html?api=http://localhost:8770&fid=0005

Query knobs (GET): &phase=retention flips CyclePhase to RETENTION_OPEN so the
Retention tab is editable; default is DRAFTING (SEC live, Georgia on the clock).
Not for production — only the widget's ?api=/?fid= test seams read these.
"""
import json
import http.server
from urllib.parse import urlparse, parse_qs

PORT = 8770
SKIPPED = "__SKIPPED__"

TEAMS = {
    "0005": {"name": "Georgia", "abbr": "UGA", "conference": "SEC", "owner": "C. Alvarez", "color": "#BA0C2F", "txt": "#F5F5F5"},
    "0011": {"name": "Alabama", "abbr": "BAMA", "conference": "SEC", "owner": "S. Lindqvist", "color": "#9E1B32", "txt": "#F5F5F5"},
    "0006": {"name": "LSU", "abbr": "LSU", "conference": "SEC", "owner": "D. Kowalski", "color": "#461D7C", "txt": "#FDD023"},
    "0013": {"name": "Tennessee", "abbr": "TENN", "conference": "SEC", "owner": "W. Coble", "color": "#FF8200", "txt": "#0A0A0A"},
    "0001": {"name": "Texas", "abbr": "TEX", "conference": "SEC", "owner": "M. Thibodeaux", "color": "#BF5700", "txt": "#F5F5F5"},
    "0014": {"name": "Oklahoma", "abbr": "OU", "conference": "SEC", "owner": "J. Redbird", "color": "#841617", "txt": "#F5F5F5"},
    "0008": {"name": "Michigan", "abbr": "MICH", "conference": "B1G", "owner": "K. Olsen", "color": "#00274C", "txt": "#FFCB05"},
    "0002": {"name": "Ohio State", "abbr": "OSU", "conference": "B1G", "owner": "R. Greer", "color": "#BB0000", "txt": "#F5F5F5"},
    "0015": {"name": "Penn State", "abbr": "PSU", "conference": "B1G", "owner": "E. Marsh", "color": "#041E42", "txt": "#F5F5F5"},
}

def _pool(names):
    out = []
    for i, (first, last, pos, year) in enumerate(names):
        out.append({"playerId": "P%d" % (i + 1), "name": first + " " + last,
                    "firstName": first, "lastName": last, "pos": pos, "year": year, "rank": i + 1, "status": "Available"})
    return out

POOL_SEC = _pool([("Jalen", "Whitfield", "QB", 2027), ("Cam", "Okafor", "RB", 2027), ("Tre", "Brandt", "WR", 2028),
                  ("Malik", "Hollis", "WR", 2027), ("Bryce", "Mercer", "TE", 2028), ("Dylan", "Tate", "RB", 2029),
                  ("Isaiah", "Rowe", "WR", 2027), ("Kaden", "Vance", "QB", 2029)])
POOL_B1G = _pool([("Marcus", "Lowery", "RB", 2027), ("Elijah", "Sutton", "WR", 2028), ("Jaylen", "Ferrell", "QB", 2027),
                  ("Carson", "Guidry", "TE", 2028), ("Devin", "Ingram", "WR", 2029)])

def _order(conf, fids):
    o = []
    n = len(fids)
    for r in (1, 2):
        for p, fid in enumerate(fids, 1):
            o.append({"round": r, "pick": p, "overallPick": (r - 1) * n + p,
                      "franchiseId": fid, "teamName": TEAMS[fid]["name"]})
    return o

STATE = {
    "SEC": {"status": "in_progress", "order": _order("SEC", ["0005", "0011", "0006", "0013", "0001", "0014"]),
            "picks": [], "pool": list(POOL_SEC), "current": None},
    "B1G": {"status": "not_started", "order": _order("B1G", ["0008", "0002", "0015"]),
            "picks": [], "pool": list(POOL_B1G), "current": None},
}

def _deadline():
    return "2026-10-10T20:00:00"  # static; the widget shows a countdown to it

def _filled(conf):
    return {"%s-%s" % (p["round"], p["pick"]) for p in STATE[conf]["picks"]}

def _set_current(conf):
    st = STATE[conf]
    if st["status"] not in ("in_progress",):
        st["current"] = None
        return
    filled = _filled(conf)
    for o in sorted(st["order"], key=lambda x: x["overallPick"]):
        if "%s-%s" % (o["round"], o["pick"]) not in filled:
            st["current"] = {**o, "pickDeadline": _deadline()}
            return
    # order exhausted
    owed = [p for p in st["picks"] if p.get("owed")]
    st["current"] = None
    st["status"] = "awaiting_makeups" if owed else "completed"

for _c in STATE:
    _set_current(_c)

def _owed(conf):
    return [p for p in STATE[conf]["picks"] if p.get("owed")]

WORKLIST = [
    {"playerId": "R1", "name": "Owen Pettaway", "pos": "WR", "conference": "SEC", "decision": "PENDING", "consecutiveYear": 1, "pickUsed": "", "rebateRemaining": 15},
    {"playerId": "R2", "name": "Micah Redd", "pos": "RB", "conference": "SEC", "decision": "PENDING", "consecutiveYear": 2, "pickUsed": "", "rebateRemaining": 10},
]

def build_feed(fid, phase):
    confs = []
    for cid, st in STATE.items():
        confs.append({"id": cid, "label": {"SEC": "SEC", "B1G": "Big Ten"}[cid], "status": st["status"],
                      "order": st["order"], "current": st["current"], "picks": st["picks"],
                      "owed": [{"round": p["round"], "pick": p["pick"], "overallPick": p["overallPick"],
                                "franchiseId": p["franchiseId"], "teamName": p["teamName"], "skippedAt": p.get("skippedAt", "")} for p in _owed(cid)],
                      "pool": [p for p in st["pool"] if p["status"] == "Available"]})
    viewer = None
    if fid and fid in TEAMS:
        vconf = TEAMS[fid]["conference"]
        cur = STATE[vconf]["current"]
        on_clock = bool(cur and cur["franchiseId"] == fid)
        owed = [{"round": p["round"], "pick": p["pick"], "overallPick": p["overallPick"]} for p in _owed(vconf) if p["franchiseId"] == fid]
        viewer = {"franchiseId": fid, "conference": vconf, "onClock": on_clock, "owedSlots": owed,
                  "roster": [], "retentionWorklist": (WORKLIST if fid == "0005" else [])}
    cycle = "RETENTION_OPEN" if phase == "retention" else "DRAFTING"
    return {"season": 2026,
            "settings": {"draftYear": 2026, "cyclePhase": cycle, "cyclePhaseLabel": cycle.replace("_", " ").title(),
                         "clockHours": 24, "skipGraceHours": 24, "totalRounds": 2, "maxRetained": 2,
                         "baseRebate": 20, "rebateStep": 5, "slotOrder": [2, 1]},
            "teams": TEAMS, "conferences": confs, "viewer": viewer, "past": []}

def do_pick(conf, fid, pid):
    st = STATE[conf]
    cur = st["current"]
    player = next((p for p in st["pool"] if p["playerId"] == pid and p["status"] == "Available"), None)
    if not player:
        return {"success": False, "message": "Player not available."}
    # make-up: viewer owns an owed slot and isn't on the clock
    owed = [p for p in st["picks"] if p.get("owed") and p["franchiseId"] == fid]
    if cur and cur["franchiseId"] == fid:
        slot = cur
        st["picks"].append({"round": slot["round"], "pick": slot["pick"], "overallPick": slot["overallPick"],
                            "franchiseId": fid, "teamName": TEAMS[fid]["name"], "playerId": pid,
                            "player": player["name"], "position": player["pos"], "owed": False, "retention": 0})
    elif owed:
        slot = sorted(owed, key=lambda x: x["overallPick"])[0]
        slot.update({"playerId": pid, "player": player["name"], "position": player["pos"], "owed": False})
    else:
        return {"success": False, "message": "It's not your turn."}
    player["status"] = "Drafted"
    _set_current(conf)
    if not _owed(conf) and st["status"] == "awaiting_makeups":
        st["status"] = "completed"
    return {"success": True, "message": "%s drafted %s." % (TEAMS[fid]["name"], player["name"])}

def do_skip(conf):
    st = STATE[conf]
    cur = st["current"]
    if not cur:
        return {"success": False, "message": "No live pick to skip."}
    st["picks"].append({"round": cur["round"], "pick": cur["pick"], "overallPick": cur["overallPick"],
                        "franchiseId": cur["franchiseId"], "teamName": cur["teamName"], "playerId": None,
                        "player": None, "position": None, "owed": True, "retention": 0, "skippedAt": _deadline()})
    _set_current(conf)
    return {"success": True, "message": "Skipped %s R%sP%s." % (cur["teamName"], cur["round"], cur["pick"])}

def do_autopick(conf):
    st = STATE[conf]
    filled = 0
    for slot in list(_owed(conf)):
        avail = next((p for p in st["pool"] if p["status"] == "Available"), None)
        if not avail:
            break
        slot.update({"playerId": avail["playerId"], "player": avail["name"], "position": avail["pos"], "owed": False})
        avail["status"] = "Drafted"
        filled += 1
    if not _owed(conf) and st["status"] == "awaiting_makeups":
        st["status"] = "completed"
    return {"success": True, "message": "Auto-picked %d owed slot(s)." % filled}

def do_retain_release(action, fid, pid):
    for w in WORKLIST:
        if w["playerId"] == pid:
            w["decision"] = "RETAIN" if action == "retain" else "RELEASE"
            w["pickUsed"] = ("Round 2" if action == "retain" else "")
            return {"success": True, "message": "%s recorded." % action}
    return {"success": False, "message": "Player not on your worklist."}

class H(http.server.BaseHTTPRequestHandler):
    def _send(self, obj):
        body = json.dumps(obj).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *a):
        pass

    def do_GET(self):
        q = parse_qs(urlparse(self.path).query)
        self._send(build_feed((q.get("fid") or [""])[0], (q.get("phase") or [""])[0]))

    def do_POST(self):
        n = int(self.headers.get("Content-Length", 0))
        body = json.loads(self.rfile.read(n) or "{}")
        a, conf, fid, pid = body.get("action"), (body.get("conference") or "").upper(), body.get("franchiseId"), body.get("playerId")
        if a == "pick":
            r = do_pick(conf, fid, pid)
        elif a in ("retain", "release"):
            r = do_retain_release(a, fid, pid)
        elif a == "skip":
            r = do_skip(conf)
        elif a == "autopick":
            r = do_autopick(conf)
        elif a == "start":
            STATE[conf]["status"] = "in_progress"; _set_current(conf); r = {"success": True, "message": "Started " + conf}
        else:
            r = {"success": False, "message": "Unknown action: %s" % a}
        self._send(r)


if __name__ == "__main__":
    print("Devy mock endpoint on http://localhost:%d" % PORT)
    print("Open:  ../home-message-devy-draft.html?api=http://localhost:%d&fid=0005" % PORT)
    print("       (add &phase=retention to test the Retention tab)")
    http.server.HTTPServer(("localhost", PORT), H).serve_forever()
