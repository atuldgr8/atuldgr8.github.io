#!/usr/bin/env python3
"""
A simple "I'm working here" sign for the Claude chats that push to this repo.

  python3 tools/lock.py status                     who holds what
  python3 tools/lock.py take <area> <who> "<why>"   claim an area before changing it
  python3 tools/lock.py drop <area> <who>           release it when you've pushed

Areas:
  site            the site and editor code (assets/, *.html, EDITING.md, serve.py, tools/)
  project-<slug>  one case study: projects/<slug>.json, projects/media/<slug>/, its entry in index.json

How it stays safe: taking a lock is itself a git push. If two chats try at the same
moment, git lets only one push through; the other pulls, sees the lock, and stops.
A lock older than 6 hours is "stale": take it anyway only if Atul says so (add --force).
"""
import json, os, subprocess, sys, time, datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIR = os.path.join(ROOT, '.locks')
BRANCH = 'editor-preview'
STALE = 6 * 3600

def git(*a, check=True):
    return subprocess.run(['git', '-C', ROOT, *a], check=check, capture_output=True, text=True)

def sync():
    git('fetch', '-q', 'origin', BRANCH)
    git('pull', '-q', '--rebase', '--autostash', 'origin', BRANCH)

def path(area): return os.path.join(DIR, area + '.json')

def read(area):
    try:
        with open(path(area)) as f: return json.load(f)
    except FileNotFoundError: return None

def push(msg, files):
    git('add', '-A', '--', *files)
    git('commit', '-q', '-m', msg)
    for _ in range(4):
        r = git('push', '-q', 'origin', BRANCH, check=False)
        if r.returncode == 0: return True
        if git('pull', '-q', '--rebase', '--autostash', 'origin', BRANCH, check=False).returncode != 0:
            # the other chat pushed the same lock file first: back out ours and take theirs
            git('rebase', '--abort', check=False)
            git('reset', '-q', 'HEAD~1')
            for f in files:
                if os.path.exists(f): os.remove(f)
            sync()
            return True
    return False

def status():
    sync()
    locks = sorted(f[:-5] for f in os.listdir(DIR) if f.endswith('.json')) if os.path.isdir(DIR) else []
    if not locks: print('No locks: everything is free.'); return
    for a in locks:
        l = read(a); age = (time.time() - l['at']) / 3600
        print(f"{a}: held by {l['who']} for {age:.1f} h ({l['why']}){'  [STALE]' if age * 3600 > STALE else ''}")

def take(area, who, why, force=False):
    os.makedirs(DIR, exist_ok=True)
    sync()
    l = read(area)
    if l and l['who'] != who:
        stale = time.time() - l['at'] > STALE
        if not (force and stale):
            print(f"LOCKED: {area} is held by {l['who']} since "
                  f"{datetime.datetime.fromtimestamp(l['at']).strftime('%d %b %H:%M')} ({l['why']}). Don't change it; ask Atul.")
            sys.exit(1)
    with open(path(area), 'w') as f:
        json.dump({'who': who, 'why': why, 'at': int(time.time())}, f, indent=1)
    if not push(f'lock: {area} taken by {who}', [path(area)]):
        print('Could not push the lock; try again.'); sys.exit(1)
    # someone else may have pushed the same lock in between: the file now says who really has it
    l = read(area)
    if l['who'] != who:
        print(f"LOCKED: {area} was just taken by {l['who']}."); sys.exit(1)
    print(f'OK: {area} is yours. Drop it when you have pushed your work.')

def drop(area, who):
    sync()
    l = read(area)
    if not l: print(f'{area} was not locked.'); return
    if l['who'] != who: print(f"{area} is held by {l['who']}, not you. Leaving it."); sys.exit(1)
    os.remove(path(area))
    push(f'lock: {area} released by {who}', [path(area)])
    print(f'Released {area}.')

if __name__ == '__main__':
    a = sys.argv[1:]
    force = '--force' in a; a = [x for x in a if x != '--force']
    if not a or a[0] == 'status': status()
    elif a[0] == 'take' and len(a) >= 3: take(a[1], a[2], ' '.join(a[3:]) or 'working', force)
    elif a[0] == 'drop' and len(a) >= 3: drop(a[1], a[2])
    else: print(__doc__)
