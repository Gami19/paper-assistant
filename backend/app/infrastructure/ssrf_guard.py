"""URL 取り込み前のホスト／IP 検査（M3 限定。完全な SSRF 対策ではない）。"""

from __future__ import annotations

import ipaddress
import socket
from urllib.parse import urlparse


def _blocked_ip(ip: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
    return bool(
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_multicast
        or ip.is_reserved
        or (ip.version == 6 and ip.ipv4_mapped and _blocked_ip(ip.ipv4_mapped)),
    )


def _hostname_blocked_literal(host: str) -> bool:
    h = host.lower().strip(".")
    if h in {"localhost", "0.0.0.0"}:
        return True
    try:
        ip = ipaddress.ip_address(h)
        return _blocked_ip(ip)
    except ValueError:
        return False


def _resolved_addresses_blocked(hostname: str) -> bool:
    """名前解決に失敗した場合は接続しない（フェイルクローズ）。"""
    try:
        infos = socket.getaddrinfo(
            hostname,
            None,
            type=socket.SOCK_STREAM,
            proto=socket.IPPROTO_TCP,
        )
    except OSError:
        return True
    for info in infos:
        sockaddr = info[4]
        addr = sockaddr[0]
        try:
            ip = ipaddress.ip_address(addr)
        except ValueError:
            continue
        if _blocked_ip(ip):
            return True
    return False


def host_matches_allowlist(host: str, allowlist: list[str]) -> bool:
    """allowlist が空でないとき、ホストがいずれかのサフィックス／完全一致に合致するか。"""
    h = host.lower().strip(".")
    for raw in allowlist:
        entry = raw.lower().strip().strip(".")
        if not entry:
            continue
        if h == entry or h.endswith("." + entry):
            return True
    return False


def assert_safe_https_url(url_str: str, allowlist: list[str]) -> None:
    """HTTPS のみ。ホスト名・リテラル IP・解決結果を検査。allowlist 非空時はホスト許可も必須。

    Raises:
        ValueError: 不許可の URL
    """
    parsed = urlparse(url_str)
    if parsed.scheme.lower() != "https":
        msg = "Only https URLs are allowed"
        raise ValueError(msg)
    host = parsed.hostname
    if host is None or host == "":
        msg = "URL must include a hostname"
        raise ValueError(msg)

    if _hostname_blocked_literal(host):
        msg = "Host is not allowed"
        raise ValueError(msg)

    if allowlist and not host_matches_allowlist(host, allowlist):
        msg = "Host is not in allowlist"
        raise ValueError(msg)

    # リテラル IP でない場合は名前解決
    try:
        ipaddress.ip_address(host)
    except ValueError:
        if _resolved_addresses_blocked(host):
            msg = "Resolved address is not allowed"
            raise ValueError(msg) from None
