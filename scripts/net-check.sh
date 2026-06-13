#!/usr/bin/env bash
# net-check.sh — diagnose whether openrift.app is slow because of a lossy
# network path (almost always a broken IPv6 route to Cloudflare's anycast edge).
#
# It compares IPv4 vs IPv6 two ways:
#   1. ICMP packet loss (quick; routers can deprioritize ping, but a large gap
#      between v4 and v6 is real loss since throttling would hit both equally)
#   2. A real HTTP load: bursts of requests multiplexed over ONE HTTP/2
#      connection, exactly like the browser loading a card grid. This is the
#      arbiter — if one TCP connection on a lossy path stalls, every multiplexed
#      request freezes together (head-of-line blocking), so the MAX time blows
#      up while the path's average latency still looks fine.
#
# Usage:  bash scripts/net-check.sh [host]
#         host defaults to openrift.app
#
# Run it on the venue's actual connection before a tournament: if it flags the
# IPv6 path as degraded, disable IPv6 on that network so every device falls back
# to the clean IPv4 path. Requires bash, curl, and ping (iputils).

set -u
# Force C locale so curl emits '.' decimals and awk parses them (German locales
# use ',' which silently corrupts the timing math).
export LC_ALL=C LANG=C
HOST="${1:-openrift.app}"
URL="https://${HOST}/"
PINGS=100
REQS=50      # concurrent requests per round (browser-like burst)
ROUNDS=3     # repeat the burst; loss is bursty, more rounds = surer to catch it

bold=$(printf '\033[1m'); red=$(printf '\033[31m'); grn=$(printf '\033[32m')
ylw=$(printf '\033[33m'); rst=$(printf '\033[0m')

echo "${bold}=== openrift network check: ${HOST} ===${rst}"
echo

# --- resolve so we can show which Cloudflare anycast IPs we're hitting --------
v4addrs=$(getent ahostsv4 "$HOST" 2>/dev/null | awk '{print $1}' | sort -u | paste -sd' ' -)
v6addrs=$(getent ahostsv6 "$HOST" 2>/dev/null | awk '{print $1}' | sort -u | paste -sd' ' -)
echo "IPv4 addresses: ${v4addrs:-<none>}"
echo "IPv6 addresses: ${v6addrs:-<none>}"
echo

# --- ICMP loss ----------------------------------------------------------------
ping_loss() {  # $1 = -4|-6
  ping "$1" -c "$PINGS" -i 0.2 -q "$HOST" 2>/dev/null \
    | grep -oE '[0-9.]+% packet loss' | grep -oE '[0-9.]+' | head -1
}
echo "${bold}ICMP packet loss (${PINGS} pkts each)${rst}"
echo "  (ICMP alone can be throttled — but a big gap between v4 and v6 is real loss,"
echo "   since throttling would hit both equally)"
l4=$(ping_loss -4); l6=$(ping_loss -6)
printf "  IPv4: %s%% loss\n" "${l4:-n/a}"
printf "  IPv6: %s%% loss\n" "${l6:-n/a}"
echo

# --- HTTP load over one multiplexed connection (the real test) ----------------
# Build REQS copies of the URL; curl --parallel multiplexes them onto a single
# HTTP/2 connection, mimicking the browser. We report avg + worst single-request
# time. On a clean path worst ~= avg; on a lossy path worst spikes to seconds.
urls=(); for i in $(seq 1 "$REQS"); do urls+=("$URL"); done

http_test() {  # $1 = -4|-6 ; prints "avg max ok" seconds + count
  # One -o /dev/null per URL: with a single -o, curl dumps every body after the
  # first to stdout and corrupts the -w timing stream. --max-time caps a stalled
  # request at 15s so the script stays bounded on a lossy path.
  local args=("$1" --parallel --parallel-immediate --parallel-max "$REQS" \
              --http2 -s --connect-timeout 10 --max-time 15)
  local url; for url in "${urls[@]}"; do args+=(-o /dev/null "$url"); done
  curl "${args[@]}" -w '%{time_total}\n' 2>/dev/null \
  | awk '{ s+=$1; n++; if($1>m)m=$1 }
         END{ if(n>0) printf "%.3f %.3f %d", s/n, m, n; else printf "0 0 0" }'
}

# Run ROUNDS bursts per family; keep the global worst and overall average.
run_family() {  # $1 = -4|-6 ; prints "avg worstmax totalok"
  local sum=0 cnt=0 worst=0 r a m n
  for r in $(seq 1 "$ROUNDS"); do
    read -r a m n <<<"$(http_test "$1")"
    sum=$(awk -v s="$sum" -v a="$a" -v n="$n" 'BEGIN{print s + a*n}')
    cnt=$((cnt + n))
    worst=$(awk -v w="$worst" -v m="$m" 'BEGIN{print (m>w)?m:w}')
  done
  awk -v s="$sum" -v c="$cnt" -v w="$worst" \
      'BEGIN{ printf "%.3f %.3f %d", (c>0?s/c:0), w, c }'
}

echo "${bold}HTTP load: ${ROUNDS}×${REQS} requests over HTTP/2 (the arbiter)${rst}"
read -r a4 m4 n4 <<<"$(run_family -4)"
read -r a6 m6 n6 <<<"$(run_family -6)"
total=$((REQS * ROUNDS))
printf "  IPv4: avg %.3fs  worst %.3fs  (%d/%d ok)\n" "$a4" "$m4" "$n4" "$total"
printf "  IPv6: avg %.3fs  worst %.3fs  (%d/%d ok)\n" "$a6" "$m6" "$n6" "$total"
echo

# --- verdict ------------------------------------------------------------------
echo "${bold}=== verdict ===${rst}"
bad6=0; reasons=""
awk_gt() { awk -v a="$1" -v b="$2" 'BEGIN{exit !(a+0>b+0)}'; }
# Signal 1: ICMP loss clearly worse on v6 than v4.
if [ -n "${l6:-}" ] && awk_gt "$l6" 10 && awk_gt "$l6" "$(awk -v x="${l4:-0}" 'BEGIN{print x+8}')"; then
  bad6=1; reasons="${reasons}  - IPv6 ping loss ${l6}% vs IPv4 ${l4}%\n"
fi
# Signal 2: an IPv6 HTTP burst stalled (worst >2s and >3x the IPv4 worst).
if awk_gt "$m6" 2 && awk_gt "$m6" "$(awk -v x="$m4" 'BEGIN{print x*3}')"; then
  bad6=1; reasons="${reasons}  - IPv6 HTTP stalled (worst ${m6}s vs IPv4 ${m4}s)\n"
fi
# Signal 3: IPv6 dropped requests (hit the timeout) while IPv4 did not.
if [ "$n6" -lt "$n4" ] && [ "$n6" -lt "$total" ]; then
  bad6=1; reasons="${reasons}  - IPv6 dropped requests: ${n6}/${total} ok vs IPv4 ${n4}/${total}\n"
fi

if [ "$bad6" -eq 1 ]; then
  printf '%b' "${red}IPv6 path to ${HOST} is degraded.${rst} Triggered by:\n"
  printf '%b' "$reasons"
  echo "Your browser prefers IPv6, so it gets the slow path. Force IPv4:"
  echo "  ${ylw}Firefox:${rst} about:config -> network.dns.disableIPv6 = true -> restart"
  echo "  ${ylw}Chrome/system:${rst} disable IPv6 on this network's adapter, or on the router"
  echo "  ${ylw}Router-wide for the venue:${rst} turn off IPv6 so every device uses IPv4"
else
  echo "${grn}Both IPv4 and IPv6 look healthy from this connection.${rst}"
  echo "If the app is still slow here, it is NOT this network path — re-check the"
  echo "browser (extensions, throttling) or capture the request's Timings tab."
fi
