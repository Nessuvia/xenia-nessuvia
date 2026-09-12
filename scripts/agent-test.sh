#!/usr/bin/env bash
#
# Verification for agents. Quiet when green, terse when red.
#
#   scripts/agent-test.sh                 typecheck, then every check* script
#   scripts/agent-test.sh turnOrder       only checks whose path matches a filter
#   scripts/agent-test.sh --checks-only   skip tsc
#   scripts/agent-test.sh --typecheck     tsc only
#   scripts/agent-test.sh --build         add the Vite build (slow; pre-handoff)
#   scripts/agent-test.sh -v              full output from failures, no truncation
#
# Exit 0 means the tree is clean. Anything else, read the lines above the summary.

set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

MAX_LINES=25        # per failing check
MAX_ERRORS=15       # tsc errors before truncating

RUN_TSC=1
RUN_CHECKS=1
RUN_BUILD=0
VERBOSE=0
FILTERS=()

for arg in "$@"; do
  case "$arg" in
    --checks-only) RUN_TSC=0 ;;
    --typecheck)   RUN_CHECKS=0 ;;
    --build)       RUN_BUILD=1 ;;
    -v|--verbose)  VERBOSE=1 ;;
    -h|--help)     sed -n '3,14p' "${BASH_SOURCE[0]}" | cut -c3- ; exit 0 ;;
    -*)            echo "unknown flag: $arg" >&2 ; exit 2 ;;
    *)             FILTERS+=("$arg") ;;
  esac
done

strip_ansi() { sed -E $'s/\x1b\\[[0-9;?]*[a-zA-Z]//g'; }

drop_node_noise() {
  grep -vE 'ExperimentalWarning|--trace-warnings|^\(node:[0-9]+\)' || true
}

failed=0
failing_names=()

# typecheck

if [[ $RUN_TSC -eq 1 ]]; then
  tsc_out=$(npx tsc -b 2>&1 | strip_ansi)
  if [[ $? -ne 0 ]]; then
    failed=1
    failing_names+=("tsc")
    errors=$(printf '%s\n' "$tsc_out" | grep -E 'error TS' || printf '%s\n' "$tsc_out")
    count=$(printf '%s\n' "$errors" | grep -c . )
    echo "FAIL  tsc -b  ($count error(s))"
    if [[ $VERBOSE -eq 1 ]]; then
      printf '%s\n' "$errors" | sed 's/^/      /'
    else
      printf '%s\n' "$errors" | head -n "$MAX_ERRORS" | sed 's/^/      /'
      [[ $count -gt $MAX_ERRORS ]] && echo "      … $((count - MAX_ERRORS)) more"
    fi
    echo
  fi
fi

# checks

if [[ $RUN_CHECKS -eq 1 ]]; then
  mapfile -t all_checks < <(
    find src \( -name 'check*.ts' -o -name 'check*.mjs' -o -name 'check*.js' \) -type f | sort
  )

  checks=()
  if [[ ${#FILTERS[@]} -eq 0 ]]; then
    checks=("${all_checks[@]}")
  else
    for f in "${all_checks[@]}"; do
      for pat in "${FILTERS[@]}"; do
        if [[ "$f" == *"$pat"* ]]; then checks+=("$f"); break; fi
      done
    done
    if [[ ${#checks[@]} -eq 0 ]]; then
      echo "no check script matched: ${FILTERS[*]}" >&2
      printf '  %s\n' "${all_checks[@]}" >&2
      exit 2
    fi
  fi

  passed=0
  for file in "${checks[@]}"; do
    out=$(node --experimental-strip-types "$file" 2>&1)
    status=$?
    out=$(printf '%s\n' "$out" | strip_ansi | drop_node_noise)

    if [[ $status -eq 0 ]]; then
      passed=$((passed + 1))
    else
      failed=1
      failing_names+=("$(basename "$file")")
      echo "FAIL  $file  (exit $status)"
      body=$(printf '%s\n' "$out" | grep -vE '^\s+at ' | grep -v '^$')
      [[ -z "$body" ]] && body="$out"
      if [[ $VERBOSE -eq 1 ]]; then
        printf '%s\n' "$body" | sed 's/^/      /'
      else
        printf '%s\n' "$body" | head -n "$MAX_LINES" | sed 's/^/      /'
        total=$(printf '%s\n' "$body" | grep -c .)
        [[ $total -gt $MAX_LINES ]] && echo "      … $((total - MAX_LINES)) more lines (-v for all)"
      fi
      echo
    fi
  done
fi

# build

if [[ $RUN_BUILD -eq 1 ]]; then
  build_out=$(npx pnpm build 2>&1 | strip_ansi)
  if [[ $? -ne 0 ]]; then
    failed=1
    failing_names+=("build")
    echo "FAIL  pnpm build"
    printf '%s\n' "$build_out" | tail -n 30 | sed 's/^/      /'
    echo
  fi
fi

# summary

if [[ $failed -eq 0 ]]; then
  parts=()
  [[ $RUN_TSC -eq 1 ]] && parts+=("tsc clean")
  [[ $RUN_CHECKS -eq 1 ]] && parts+=("${passed}/${#checks[@]} checks passed")
  [[ $RUN_BUILD -eq 1 ]] && parts+=("build ok")
  echo "PASS  $(IFS=', '; echo "${parts[*]}")"
  exit 0
else
  echo "FAILED: ${failing_names[*]}"
  exit 1
fi