"""Bedrock 呼び出し由来のドメイン例外（HTTP へのマップはルータ側）。"""


class BedrockThrottledError(Exception):
    """レート制限（Throttling 等）。クライアントには 429 を返す。"""
