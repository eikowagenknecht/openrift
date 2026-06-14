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
# When IPv6 looks bad it then localizes the fault:
#   3. Path localization: a TTL/hop-limit sweep maps the route, then pings each
#      hop. Real loss appears at a hop AND persists to the destination — that
#      tells you whether it is your router, your ISP, or the ISP<->Cloudflare
#      boundary, which decides whether you can fix it or must work around it.
#   4. Scope: pings another Cloudflare site plus a non-Cloudflare control over
#      IPv6, so you can tell "ISP<->Cloudflare peering" from "all my IPv6".
#   5. Large-packet check: a separate v6 failure mode where packets above the
#      path MTU are blackholed (ICMPv6 "Packet Too Big" filtered) while IPv4 is
#      fine — large browser payloads stall even if ping loss looks moderate.
#
# Usage:  bash scripts/net-check.sh [host]
#         host defaults to openrift.app
#         (localization pings each hop, so a degraded run takes a minute or two)
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
REQS=50       # concurrent requests per round (browser-like burst)
ROUNDS=3      # repeat the burst; loss is bursty, more rounds = surer to catch it
MAXHOPS=20    # TTL ceiling for the localization sweep
HOPPINGS=40   # pings per hop when measuring per-hop loss (0.2s apart)
BIGSIZE=1400  # payload bytes for the large-packet (MTU blackhole) probe

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

# --- shared loss helper -------------------------------------------------------
loss_pct() {  # $1 = -4|-6 ; $2 = host/IP ; $3 = count ; prints a number (loss %)
  ping "$1" -c "$3" -i 0.2 -W 1 -q "$2" 2>/dev/null \
    | grep -oE '[0-9.]+% packet loss' | grep -oE '[0-9.]+' | head -1
}

# --- IPv6 path localization: WHERE does the loss start? -----------------------
# Map the route with a TTL/hop-limit sweep (no traceroute dependency), then ping
# each responding hop. The rule: real loss appears at a hop AND persists through
# every later hop to the destination. Loss that shows at a middle hop but clears
# again lower down is just that router rate-limiting ICMP to itself — ignore it.
# Read the column top-down and find the FIRST hop whose loss holds to the DEST:
#   - holds from hop 1 (your router)      -> your LAN / router / Wi-Fi
#   - clean through your ISP, starts deep -> ISP transit or ISP<->CDN peering
echo "${bold}IPv6 path localization (where does the loss start?)${rst}"
v6tgt=$(getent ahostsv6 "$HOST" 2>/dev/null | awk '{print $1; exit}')
if [ -z "$v6tgt" ]; then
  echo "  (no IPv6 address for ${HOST} — skipping)"
else
  echo "  hop  address                                  loss   (DEST loss is the truth;"
  echo "                                                        middle hops can read high"
  echo "                                                        from ICMP rate-limiting)"
  for ttl in $(seq 1 "$MAXHOPS"); do
    out=$(ping -6 -t "$ttl" -c 1 -W 2 "$v6tgt" 2>&1)
    if printf '%s' "$out" | grep -q 'bytes from'; then
      dl=$(loss_pct -6 "$v6tgt" "$HOPPINGS")
      printf "  %3d  %-42s %4s%%  (DEST)\n" "$ttl" "$v6tgt" "${dl:-?}"
      break
    fi
    hop=$(printf '%s' "$out" | grep -oiE 'from [0-9a-f:]+' | head -1 | awk '{print $2}')
    if [ -z "$hop" ]; then
      printf "  %3d  %-42s     *\n" "$ttl" "*"
      continue
    fi
    hl=$(loss_pct -6 "$hop" "$HOPPINGS")
    printf "  %3d  %-42s %4s%%\n" "$ttl" "$hop" "${hl:-?}"
  done
fi
echo

# --- scope: Cloudflare-specific, or all of IPv6? ------------------------------
# If another Cloudflare site is just as lossy but a non-Cloudflare site is clean,
# the fault is the ISP<->Cloudflare IPv6 peering, not your IPv6 in general and
# not this one host. (Vodafone cable <-> Cloudflare is a long-running example.)
echo "${bold}Scope: is it Cloudflare-wide or all IPv6?${rst}"
cf6=$(loss_pct -6 cloudflare.com "$PINGS")
ctl6=$(loss_pct -6 google.com "$PINGS")
printf "  other Cloudflare host (cloudflare.com): %s%% IPv6 loss\n" "${cf6:-n/a}"
printf "  non-Cloudflare control (google.com):    %s%% IPv6 loss\n" "${ctl6:-n/a}"
echo

# --- large-packet (PMTUD blackhole) check -------------------------------------
# A second, independent v6 failure mode: if big packets vanish while small ones
# pass AND IPv4 is fine at the same size, the path blackholes packets above its
# MTU because ICMPv6 "Packet Too Big" is filtered. Browser payloads are large,
# so this stalls page loads even when ordinary ping loss looks only moderate.
echo "${bold}Large-packet check (${BIGSIZE}B payload — MTU blackhole)${rst}"
big6=$(ping -6 -c 40 -i 0.2 -W 1 -s "$BIGSIZE" -q "$HOST" 2>/dev/null \
  | grep -oE '[0-9.]+% packet loss' | grep -oE '[0-9.]+' | head -1)
big4=$(ping -4 -c 40 -i 0.2 -W 1 -s "$BIGSIZE" -q "$HOST" 2>/dev/null \
  | grep -oE '[0-9.]+% packet loss' | grep -oE '[0-9.]+' | head -1)
printf "  IPv6 @ %sB: %s%% loss   IPv4 @ %sB: %s%% loss\n" \
  "$BIGSIZE" "${big6:-n/a}" "$BIGSIZE" "${big4:-n/a}"
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
# Signal 4: large IPv6 packets blackholed while IPv4 at the same size is fine.
if [ -n "${big6:-}" ] && [ -n "${big4:-}" ] && awk_gt "$big6" 50 && ! awk_gt "$big4" 10; then
  bad6=1; reasons="${reasons}  - IPv6 blackholes ${BIGSIZE}B packets (${big6}% loss vs IPv4 ${big4}%) — PMTUD blackhole\n"
fi

if [ "$bad6" -eq 1 ]; then
  printf '%b' "${red}IPv6 path to ${HOST} is degraded.${rst} Triggered by:\n"
  printf '%b' "$reasons"
  # Scope conclusion: peering-level fault vs your IPv6 in general.
  if [ -n "${cf6:-}" ] && [ -n "${ctl6:-}" ] && awk_gt "$cf6" 10 && ! awk_gt "$ctl6" 5; then
    printf '%b' "${ylw}Scope:${rst} every Cloudflare site loses (~${cf6}%) but non-Cloudflare IPv6 is\n"
    echo "clean (~${ctl6}%) — the fault is your ISP's IPv6 peering with Cloudflare (AS13335),"
    echo "not your router or LAN. You can't fix the peering; the IPv4 workaround below is"
    echo "the practical fix. Worth an ISP ticket citing IPv6-only loss to Cloudflare."
    echo "(Vodafone cable has a long-running, recurring version of exactly this.)"
  fi
  echo "Your browser prefers IPv6, so it gets the slow path. Force IPv4:"
  echo "  ${ylw}Firefox:${rst} about:config -> network.dns.disableIPv6 = true -> restart"
  echo "  ${ylw}Chrome/system:${rst} disable IPv6 on this network's adapter, or on the router"
  echo "  ${ylw}Router-wide for the venue:${rst} turn off IPv6 so every device uses IPv4"
else
  echo "${grn}Both IPv4 and IPv6 look healthy from this connection.${rst}"
  echo "If the app is still slow here, it is NOT this network path — re-check the"
  echo "browser (extensions, throttling) or capture the request's Timings tab."
fi
