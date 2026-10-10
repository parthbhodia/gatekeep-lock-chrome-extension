#!/usr/bin/env bash
#
# setup.sh — point this project at YOUR identifiers, then prove every place
# agrees. Run it once, before the first `xcodegen generate`.
#
#   ./setup.sh com.yourname                    # -> com.yourname.catbreak.*
#   ./setup.sh com.yourname.catbreak           # same (a trailing .catbreak is kept)
#   ./setup.sh com.yourname --team ABCDE12345  # also fills in DEVELOPMENT_TEAM
#   ./setup.sh --check                         # verify only, change nothing
#
# The placeholder prefix `com.catbreak` appears in the XcodeGen spec, in five
# entitlements files, in the shared Swift constant and in the CI workflow, and
# they all have to agree. Nothing errors if they drift: an extension whose
# entitlements name a different App Group than `SharedConstants.appGroup` just
# reads an empty store, so the shield shows first-run copy and the threshold
# ladder quietly loses count. Hence one command, and a check.

set -euo pipefail

IOS_DIR=$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
REPO_DIR=$(dirname "$IOS_DIR")
WORKFLOW="$REPO_DIR/.github/workflows/ios-build.yml"
PROJECT_YML="$IOS_DIR/project.yml"
APP_INFO_PLIST="$IOS_DIR/CatBreak/Info.plist"
SWIFT_CONSTANTS="$IOS_DIR/Shared/SharedConstants.swift"
PLACEHOLDER="com.catbreak"

ENTITLEMENTS=(
  "$IOS_DIR/CatBreak/CatBreak.entitlements"
  "$IOS_DIR/MonitorExtension/MonitorExtension.entitlements"
  "$IOS_DIR/ShieldConfigExtension/ShieldConfigExtension.entitlements"
  "$IOS_DIR/ShieldActionExtension/ShieldActionExtension.entitlements"
  "$IOS_DIR/ReportExtension/ReportExtension.entitlements"
)

if [ -t 1 ]; then
  BOLD=$(printf '\033[1m'); DIM=$(printf '\033[2m')
  RED=$(printf '\033[31m'); GREEN=$(printf '\033[32m'); OFF=$(printf '\033[0m')
else
  BOLD=; DIM=; RED=; GREEN=; OFF=
fi

die() { printf '%ssetup.sh: %s%s\n' "$RED" "$*" "$OFF" >&2; exit 1; }
ok()  { printf '  %s✓%s %s\n' "$GREEN" "$OFF" "$*"; }
bad() { printf '  %s✗%s %s\n' "$RED" "$OFF" "$*"; }

usage() {
  sed -n '3,9p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
}

# --- readers -----------------------------------------------------------------
# Everything is read back out of the files rather than assumed, so --check is
# honest even after someone hand-edits one of them in Xcode.

spec_prefix() {
  sed -n 's/^[[:space:]]*bundleIdPrefix:[[:space:]]*//p' "$PROJECT_YML" | head -n1
}

bundle_ids() {
  sed -n 's/^[[:space:]]*PRODUCT_BUNDLE_IDENTIFIER:[[:space:]]*//p' "$PROJECT_YML"
}

# The app's own id is the one every extension id is built from. Pick the id
# that the most of them are built from (ties: the shortest), so one id that was
# hand-edited out of the family can't be mistaken for the app's.
app_bundle_id() {
  local ids candidate best best_score score
  ids=$(bundle_ids)
  best=; best_score=-1
  while IFS= read -r candidate; do
    [ -n "$candidate" ] || continue
    score=$(printf '%s\n' "$ids" | grep -cF -- "$candidate" || true)
    if [ "$score" -gt "$best_score" ]; then best=$candidate; best_score=$score; fi
  done < <(printf '%s\n' "$ids" | awk '{ print length, $0 }' | sort -n | cut -d' ' -f2-)
  printf '%s\n' "$best"
}

# The single <string> inside an entitlements file's application-groups array.
app_group_in_plist() {
  sed -n '/application-groups/,/<\/array>/ s|.*<string>\(.*\)</string>.*|\1|p' "$1"
}

app_group_in_swift() {
  sed -n 's/.*appGroup = "\([^"]*\)".*/\1/p' "$SWIFT_CONSTANTS"
}

url_name_in_plist() {
  sed -n '/CFBundleURLName/ { n; s|.*<string>\(.*\)</string>.*|\1|p; }' "$APP_INFO_PLIST"
}

# --- writers -----------------------------------------------------------------

# In-place edit that works with both BSD sed (macOS) and GNU sed: write to a
# temp file, then redirect it back into the original so mode and inode survive.
sed_inplace() {
  local file=$1 script=$2 tmp
  tmp=$(mktemp "${TMPDIR:-/tmp}/catbreak-setup.XXXXXX")
  LC_ALL=C sed "$script" "$file" >"$tmp"
  cat "$tmp" >"$file"
  rm -f "$tmp"
}

# Files that mention $1. Docs keep the placeholder on purpose (they explain
# it), this script mentions it in its own comments, and a generated
# .xcodeproj is rebuilt by xcodegen anyway.
files_mentioning() {
  local token=$1
  {
    grep -rlF --binary-files=without-match \
      --exclude='*.md' --exclude='setup.sh' --exclude-dir='*.xcodeproj' \
      -- "$token" "$IOS_DIR" || true
    if [ -f "$WORKFLOW" ]; then grep -lF -- "$token" "$WORKFLOW" || true; fi
  } | sort -u
}

rename_to() {
  local from=$1 to=$2 file count=0
  while IFS= read -r file; do
    [ -n "$file" ] || continue
    sed_inplace "$file" "s|${from//./\\.}|$to|g"
    printf '  %s%s%s\n' "$DIM" "${file#$REPO_DIR/}" "$OFF"
    count=$((count + 1))
  done < <(files_mentioning "$from")
  [ "$count" -gt 0 ] || die "found no file mentioning '$from' — already renamed?"
}

set_team() {
  local team=$1
  if grep -qE '^[[:space:]]*DEVELOPMENT_TEAM:' "$PROJECT_YML"; then
    sed_inplace "$PROJECT_YML" \
      "s|^\([[:space:]]*\)DEVELOPMENT_TEAM:.*|\1DEVELOPMENT_TEAM: $team|"
  elif grep -qE '^[[:space:]]*#[[:space:]]*DEVELOPMENT_TEAM:' "$PROJECT_YML"; then
    sed_inplace "$PROJECT_YML" \
      "s|^\([[:space:]]*\)#[[:space:]]*DEVELOPMENT_TEAM:.*|\1DEVELOPMENT_TEAM: $team|"
  else
    die "no DEVELOPMENT_TEAM line in project.yml — set the Team in Xcode instead"
  fi
}

# --- the check ---------------------------------------------------------------

verify() {
  local fails=0 prefix ids app_id group groups file name
  prefix=$(spec_prefix)

  printf '%sIdentifiers%s\n' "$BOLD" "$OFF"
  if [ -z "$prefix" ]; then
    bad "project.yml has no bundleIdPrefix"; fails=$((fails + 1))
  elif [ "$prefix" = "$PLACEHOLDER" ]; then
    bad "still the placeholder prefix '$PLACEHOLDER' — run: ./setup.sh com.yourname"
    fails=$((fails + 1))
  else
    ok "bundle id prefix: $prefix"
  fi

  ids=$(bundle_ids)
  local n_ids n_uniq
  n_ids=$(printf '%s\n' "$ids" | grep -c . || true)
  n_uniq=$(printf '%s\n' "$ids" | sort -u | grep -c . || true)
  if [ "$n_ids" -ne 5 ]; then
    bad "expected 5 PRODUCT_BUNDLE_IDENTIFIER lines in project.yml, found $n_ids"
    fails=$((fails + 1))
  elif [ "$n_uniq" -ne 5 ]; then
    bad "the 5 bundle ids are not all distinct"; fails=$((fails + 1))
  else
    ok "5 distinct bundle ids (app + 4 extensions)"
  fi
  if [ -n "$prefix" ]; then
    local stray
    stray=$(printf '%s\n' "$ids" | grep -v "^${prefix}\." || true)
    if [ -n "$stray" ]; then
      bad "bundle id(s) outside the prefix: $(printf '%s ' $stray)"
      fails=$((fails + 1))
    fi
  fi

  printf '%sApp Group (must match on all five targets)%s\n' "$BOLD" "$OFF"
  local found=0
  groups=$(app_group_in_swift)
  for file in "${ENTITLEMENTS[@]}"; do
    if [ ! -f "$file" ]; then
      bad "missing ${file#$REPO_DIR/}"; fails=$((fails + 1)); continue
    fi
    found=$((found + 1))
    groups="$groups
$(app_group_in_plist "$file")"
  done
  local n_groups
  n_groups=$(printf '%s\n' "$groups" | sort -u | grep -c . || true)
  if [ "$n_groups" -ne 1 ]; then
    bad "the App Group id disagrees across files:"
    printf '%s\n' "$groups" | sort -u | sed 's/^/      /'
    fails=$((fails + 1))
  else
    group=$(printf '%s\n' "$groups" | sort -u | grep .)
    ok "$group — same in SharedConstants.swift and $found entitlements files"
    case "$group" in
      group.*) ;;
      *) bad "App Group ids must start with 'group.'"; fails=$((fails + 1)) ;;
    esac
  fi

  printf '%sCross-references%s\n' "$BOLD" "$OFF"
  app_id=$(app_bundle_id)
  name=$(url_name_in_plist)
  if [ "$name" = "$app_id" ]; then
    ok "CFBundleURLName matches the app id ($app_id)"
  else
    bad "CatBreak/Info.plist CFBundleURLName is '$name', app id is '$app_id'"
    fails=$((fails + 1))
  fi

  if [ -f "$WORKFLOW" ]; then
    local wrong
    wrong=$(grep -oE 'simctl (launch|terminate) "\$UDID" [A-Za-z0-9.-]+' "$WORKFLOW" \
      | awk '{print $NF}' | sort -u | grep -v "^${app_id}$" || true)
    if [ -n "$wrong" ]; then
      bad "ios-build.yml still launches $(printf '%s ' $wrong)— CI would fail on your fork"
      fails=$((fails + 1))
    else
      ok "ios-build.yml launches $app_id"
    fi
  fi

  local leftover
  leftover=$(files_mentioning "$PLACEHOLDER")
  if [ -n "$leftover" ] && [ "$prefix" != "$PLACEHOLDER" ]; then
    bad "'$PLACEHOLDER' still appears in:"
    printf '%s\n' "$leftover" | sed "s|^$REPO_DIR/|      |"
    fails=$((fails + 1))
  fi

  echo
  if [ "$fails" -eq 0 ]; then
    printf '%s%sAll checks passed.%s\n' "$GREEN" "$BOLD" "$OFF"
    return 0
  fi
  printf '%s%s%d check(s) failed.%s\n' "$RED" "$BOLD" "$fails" "$OFF"
  return 1
}

# --- arguments ---------------------------------------------------------------

NEW_PREFIX=
TEAM=
CHECK_ONLY=0
GENERATE=1

while [ $# -gt 0 ]; do
  case "$1" in
    -h|--help) usage; exit 0 ;;
    --check) CHECK_ONLY=1 ;;
    --no-generate) GENERATE=0 ;;
    --team) [ $# -ge 2 ] || die "--team needs a 10-character Apple team id"
            TEAM=$2; shift ;;
    --team=*) TEAM=${1#--team=} ;;
    -*) die "unknown option '$1' (try --help)" ;;
    *) [ -z "$NEW_PREFIX" ] || die "give one prefix, not two ('$NEW_PREFIX' and '$1')"
       NEW_PREFIX=$1 ;;
  esac
  shift
done

[ -f "$PROJECT_YML" ] || die "run me from the ios/ folder of the repo (no project.yml next to me)"

if [ "$CHECK_ONLY" -eq 1 ]; then
  [ -z "$NEW_PREFIX$TEAM" ] || die "--check changes nothing, so it takes no arguments"
  verify
  exit $?
fi

if [ -z "$NEW_PREFIX" ] && [ -z "$TEAM" ]; then
  usage
  echo
  printf 'Current prefix: %s%s%s\n' "$BOLD" "$(spec_prefix)" "$OFF"
  exit 1
fi

if [ -n "$TEAM" ]; then
  printf '%s' "$TEAM" | grep -qE '^[A-Z0-9]{10}$' \
    || die "'$TEAM' does not look like an Apple team id (10 chars, A-Z0-9)"
fi

if [ -n "$NEW_PREFIX" ]; then
  # A reverse-DNS prefix: letters, digits, hyphens and dots, at least one dot,
  # no empty segments. Apple allows exactly this in a bundle id.
  case "$NEW_PREFIX" in
    *..*|.*|*.) die "'$NEW_PREFIX' is not a valid reverse-DNS prefix" ;;
    *.*) ;;
    *) die "'$NEW_PREFIX' needs at least one dot (e.g. com.yourname)" ;;
  esac
  printf '%s' "$NEW_PREFIX" | grep -qE '^[A-Za-z0-9][A-Za-z0-9.-]*[A-Za-z0-9]$' \
    || die "'$NEW_PREFIX' may only contain letters, digits, hyphens and dots"

  # `./setup.sh com.yourname` and `./setup.sh com.yourname.catbreak` mean the
  # same thing — never com.yourname.catbreak.catbreak.
  case "$NEW_PREFIX" in
    *.catbreak) ;;
    *) NEW_PREFIX="$NEW_PREFIX.catbreak" ;;
  esac

  OLD_PREFIX=$(spec_prefix)
  [ -n "$OLD_PREFIX" ] || die "project.yml has no bundleIdPrefix line to rename"

  if [ "$OLD_PREFIX" = "$NEW_PREFIX" ]; then
    printf 'Already using %s%s%s — nothing to rename.\n\n' "$BOLD" "$NEW_PREFIX" "$OFF"
  else
    printf 'Renaming %s%s%s -> %s%s%s in:\n' \
      "$BOLD" "$OLD_PREFIX" "$OFF" "$BOLD" "$NEW_PREFIX" "$OFF"
    rename_to "$OLD_PREFIX" "$NEW_PREFIX"
    echo
  fi
fi

if [ -n "$TEAM" ]; then
  set_team "$TEAM"
  printf 'DEVELOPMENT_TEAM set to %s%s%s in project.yml.\n\n' "$BOLD" "$TEAM" "$OFF"
fi

verify || die "the check failed — fix the above before opening Xcode"

echo
if [ "$GENERATE" -eq 0 ]; then
  printf 'Skipped xcodegen (--no-generate).\n'
elif command -v xcodegen >/dev/null 2>&1; then
  printf '%sxcodegen generate%s\n' "$BOLD" "$OFF"
  (cd "$IOS_DIR" && xcodegen generate)
  cat <<NEXT

Next:
  open CatBreak.xcodeproj
  1. Signing & Capabilities: pick your Team on all five targets. Automatic
     signing registers the bundle ids, the App Group and Family Controls
     (development) for you; if Family Controls is missing on a target, add it
     with + Capability.
  2. Pick your iPhone (not a Simulator — Screen Time needs real hardware) and
     Run. Tap "Allow Screen Time access" on first launch.
  3. Settings -> Choose apps to limit, pick an app you actually use, set a
     short limit, then go use it.
NEXT
else
  cat <<NEXT
XcodeGen isn't installed, so the project wasn't generated. On your Mac:
  brew install xcodegen
  cd ios && xcodegen generate && open CatBreak.xcodeproj
NEXT
fi
