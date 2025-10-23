#!/usr/bin/env bash
set -euo pipefail

# ---------------------------------------
# curl-based Riot fetcher (account + matches + compact summary)
# Inputs: --name, --tag, --region [EUW|EUNE|NA|KR|...]
# Optional: --count, --start, --queue, --type, --outdir, --include-summoner
# Depends on: RIOT_API_KEY env var, curl, jq
# ---------------------------------------

die(){ echo "Error: $*" >&2; exit 1; }

[[ -n "${RIOT_API_KEY:-}" ]] || die "RIOT_API_KEY is not set. export it first."

NAME=""
TAG=""
REGION=""
COUNT=20
START=0
QUEUE=""
TYPE=""
OUTDIR="data"
INCLUDE_SUMMONER="false"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --name) NAME="$2"; shift 2 ;;
    --tag) TAG="$2"; shift 2 ;;
    --region) REGION="$2"; shift 2 ;;
    --count) COUNT="$2"; shift 2 ;;
    --start) START="$2"; shift 2 ;;
    --queue) QUEUE="$2"; shift 2 ;;
    --type) TYPE="$2"; shift 2 ;;
    --outdir) OUTDIR="$2"; shift 2 ;;
    --include-summoner) INCLUDE_SUMMONER="true"; shift 1 ;;
    -h|--help)
      cat <<EOF
Usage:
  $0 --name "GameName" --tag "TAG" --region EUW [--count 20] [--start 0] [--queue 420] [--type ranked] [--include-summoner] [--outdir data]

Examples:
  $0 --name "YourName" --tag "EUW" --region EUW
  $0 --name "YourName" --tag "EUW" --region EUW --include-summoner --count 50 --queue 420 --type ranked
EOF
      exit 0 ;;
    *) die "Unknown arg: $1" ;;
  esac
done

[[ -n "$NAME" && -n "$TAG" && -n "$REGION" ]] || die "Missing required args. Use --name, --tag, --region."

# Normalize region
REGION_UPPER="$(echo "$REGION" | tr '[:lower:]' '[:upper:]')"
case "$REGION_UPPER" in
  EUW1) REGION_UPPER="EUW" ;;
  EUN1) REGION_UPPER="EUNE" ;;
  NA1) REGION_UPPER="NA" ;;
  BR1) REGION_UPPER="BR" ;;
  JP1) REGION_UPPER="JP" ;;
  LA1) REGION_UPPER="LAN" ;;
  LA2) REGION_UPPER="LAS" ;;
  OC1) REGION_UPPER="OCE" ;;
  TR1) REGION_UPPER="TR" ;;
esac

# Maps
declare -A PLATFORM_BY_REGION=(
  [NA]=na1 [BR]=br1 [LAN]=la1 [LAS]=la2 [OCE]=oc1
  [EUW]=euw1 [EUNE]=eun1 [TR]=tr1 [RU]=ru
  [KR]=kr [JP]=jp1
)
declare -A REGIONAL_BY_REGION=(
  [NA]=americas [BR]=americas [LAN]=americas [LAS]=americas [OCE]=americas
  [EUW]=europe [EUNE]=europe [TR]=europe [RU]=europe
  [KR]=asia [JP]=asia
)

PLATFORM="${PLATFORM_BY_REGION[$REGION_UPPER]:-}"
REGIONAL="${REGIONAL_BY_REGION[$REGION_UPPER]:-}"
[[ -n "$PLATFORM" && -n "$REGIONAL" ]] || die "Unsupported region '$REGION'. Try EUW, EUNE, NA, KR, JP, BR, LAN, LAS, OCE, TR, RU."

mkdir -p "$OUTDIR"
TS="$(date -u +%Y%m%dT%H%M%SZ)"
SAFE_NAME="$(echo "$NAME" | tr ' ' '_' )"

# URL-encode name & tag safely (handles spaces/specials)
NAME_ENC="$(printf '%s' "$NAME" | jq -sRr @uri)"
TAG_ENC="$(printf '%s' "$TAG"  | jq -sRr @uri)"

# Curl wrapper with basic retry / 429 handling
curl_get_json () {
  local url="$1"
  shift
  local attempt=0
  local max_attempts=5
  local sleep_s=1

  while (( attempt < max_attempts )); do
    local hdr body http_code retry_after
    hdr="$(mktemp)"
    body="$(mktemp)"
    http_code=$(curl -sS -D "$hdr" -o "$body" -w "%{http_code}" \
      -H "X-Riot-Token: ${RIOT_API_KEY}" \
      "$url" "$@") || http_code=000

    if [[ "$http_code" == "200" ]]; then
      jq . < "$body"
      rm -f "$hdr" "$body"
      return 0
    fi

    if [[ "$http_code" == "429" ]]; then
      retry_after=$(awk -F': ' 'tolower($1)=="retry-after"{print $2}' "$hdr" | tr -d '\r')
      [[ -n "$retry_after" ]] || retry_after="$sleep_s"
      sleep "$retry_after"
      ((attempt++))
      (( sleep_s = sleep_s<16 ? sleep_s*2 : 16 ))
      rm -f "$hdr" "$body"
      continue
    fi

    if [[ "$http_code" =~ ^5 ]]; then
      sleep "$sleep_s"
      ((attempt++))
      (( sleep_s = sleep_s<16 ? sleep_s*2 : 16 ))
      rm -f "$hdr" "$body"
      continue
    fi

    echo "Request failed ($http_code) for $url" >&2
    cat "$body" >&2 || true
    rm -f "$hdr" "$body"
    return 1
  done

  die "GET $url exhausted retries"
}

# 1) Account by Riot ID -> PUUID
ACCOUNT_FILE="${OUTDIR}/account_${SAFE_NAME}_${TAG}_${TS}.json"
echo "=> Resolving account (PUUID) for ${NAME}#${TAG} via ${REGIONAL} ..."
curl_get_json "https://${REGIONAL}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${NAME_ENC}/${TAG_ENC}" \
  > "$ACCOUNT_FILE"

PUUID="$(jq -r '.puuid' "$ACCOUNT_FILE")"
[[ "$PUUID" != "null" && -n "$PUUID" ]] || die "No PUUID returned. Check name/tag/region."

# 2) Optional: Summoner-V4 by PUUID (platform route)
if [[ "$INCLUDE_SUMMONER" == "true" ]]; then
  SUMMONER_FILE="${OUTDIR}/summoner_${SAFE_NAME}_${TAG}_${TS}.json"
  echo "=> Fetching Summoner-V4 (platform ${PLATFORM}) ..."
  curl_get_json "https://${PLATFORM}.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${PUUID}" > "$SUMMONER_FILE"
fi

# 3) Match IDs
MATCH_IDS_FILE="${OUTDIR}/match_ids_${SAFE_NAME}_${TAG}_${TS}.json"
echo "=> Fetching match IDs (start=${START}, count=${COUNT}, queue=${QUEUE:-none}, type=${TYPE:-none}) ..."
params=( "--get" "--data-urlencode" "start=${START}" "--data-urlencode" "count=${COUNT}" )
[[ -n "${QUEUE}" ]] && params+=( "--data-urlencode" "queue=${QUEUE}" )
[[ -n "${TYPE}"  ]] && params+=( "--data-urlencode" "type=${TYPE}" )

curl_get_json "https://${REGIONAL}.api.riotgames.com/lol/match/v5/matches/by-puuid/${PUUID}/ids" "${params[@]}" \
  > "$MATCH_IDS_FILE"

# 4) Match details
MATCHES_FILE="${OUTDIR}/matches_${SAFE_NAME}_${TAG}_${TS}.json}"
# fix accidental trailing brace if it sneaks in (safety)
MATCHES_FILE="${OUTDIR}/matches_${SAFE_NAME}_${TAG}_${TS}.json"
echo "=> Fetching match details ..."
echo "[]" > "$MATCHES_FILE" # start as an array

mapfile -t IDS < <(jq -r '.[]' "$MATCH_IDS_FILE")
for mid in "${IDS[@]}"; do
  echo "   - $mid"
  TMP="$(mktemp)"
  if curl_get_json "https://${REGIONAL}.api.riotgames.com/lol/match/v5/matches/${mid}" > "$TMP"; then
    jq --slurpfile new "$TMP" '. + $new' "$MATCHES_FILE" > "${MATCHES_FILE}.tmp" && mv "${MATCHES_FILE}.tmp" "$MATCHES_FILE"
  else
    echo "     (warn) failed to fetch $mid, continuing..." >&2
  fi
  rm -f "$TMP"
done

# 4b) Compact per-match summary for your account (champ + win)
SUMMARY_FILE="${OUTDIR}/matches_summary_${SAFE_NAME}_${TAG}_${TS}.json"
jq --arg puuid "$PUUID" '
  map(
    ( .info.participants | map(select(.puuid == $puuid)) | .[0] ) as $me
    | select($me != null)
    | {
        matchId: .metadata.matchId,
        champion: $me.championName,
        win: $me.win
      }
  )
' "$MATCHES_FILE" > "$SUMMARY_FILE"
echo "=> Wrote compact summary: $SUMMARY_FILE"

# 5) Run index (simplified for jq portability)
INDEX_FILE="${OUTDIR}/run_index_${SAFE_NAME}_${TAG}_${TS}.json"

IDS_LEN="$(jq 'length' "$MATCH_IDS_FILE")"
MTS_LEN="$(jq 'length' "$MATCHES_FILE")"

# queue as number or null
if [[ -n "${QUEUE}" ]]; then
  QUEUE_JSON="$(printf '%s' "$QUEUE" | jq -R 'try tonumber catch null')"
else
  QUEUE_JSON="null"
fi

# type as string or null
if [[ -n "${TYPE}" ]]; then
  TYPE_JSON="$(printf '%s' "$TYPE" | jq -R '.')"
else
  TYPE_JSON="null"
fi

jq -n \
  --arg name "$NAME" \
  --arg tag "$TAG" \
  --arg region "$REGION_UPPER" \
  --arg platform "$PLATFORM" \
  --arg regional "$REGIONAL" \
  --arg puuid "$PUUID" \
  --arg account "$(basename "$ACCOUNT_FILE")" \
  --arg match_ids "$(basename "$MATCH_IDS_FILE")" \
  --arg matches "$(basename "$MATCHES_FILE")" \
  --arg summary "$(basename "$SUMMARY_FILE")" \
  --arg ts "$TS" \
  --arg summoner "${SUMMONER_FILE:+$(basename "$SUMMONER_FILE")}" \
  --argjson start "$START" \
  --argjson count "$COUNT" \
  --argjson ids_len "$IDS_LEN" \
  --argjson mts_len "$MTS_LEN" \
  --argjson queue "$QUEUE_JSON" \
  --argjson type "$TYPE_JSON" \
'
  ($summoner|length) as $hasSummoner
| ($queue != null)   as $hasQueue
| ($type  != null)   as $hasType
| {
    riot_id: {name:$name, tag:$tag},
    region: $region,
    platform: $platform,
    regional: $regional,
    puuid: $puuid,
    counts: { match_ids: $ids_len, matches: $mts_len },
    files: (
      {account:$account, match_ids:$match_ids, matches:$matches, summary:$summary}
      | if $hasSummoner then . + {summoner:$summoner} else . end
    ),
    filters: (
      {start:$start, count:$count}
      | if $hasQueue then . + {queue:$queue} else . end
      | if $hasType  then . + {type:$type}  else . end
    ),
    timestamp_utc: $ts
  }
' > "$INDEX_FILE"

echo
echo "Done. Files:"
printf "  - %s\n" "$ACCOUNT_FILE" "${SUMMONER_FILE:-}" "$MATCH_IDS_FILE" "$MATCHES_FILE" "$SUMMARY_FILE" "$INDEX_FILE" | sed '/^ *- $/d'
