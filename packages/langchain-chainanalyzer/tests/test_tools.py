"""Offline tests: API-key mode against an httpx.MockTransport (no network, no payments)."""

from __future__ import annotations

import json

import httpx
import pytest

from langchain_chainanalyzer import (
    ChainAnalyzerClient,
    ChainAnalyzerError,
    ChainAnalyzerToolkit,
    get_chainanalyzer_tools,
)

TRON = "TG5iBMQPrDzJJAUM8GMVBf1hRaJ1wvzsGi"


def _client(handler) -> ChainAnalyzerClient:
    c = ChainAnalyzerClient(api_key="tfk_test", base_url="https://example.test")
    c._http = httpx.AsyncClient(transport=httpx.MockTransport(handler), headers={"X-API-Key": "tfk_test"})
    return c


def test_requires_credentials(monkeypatch):
    monkeypatch.delenv("CHAINANALYZER_API_KEY", raising=False)
    monkeypatch.delenv("X402_PRIVATE_KEY", raising=False)
    with pytest.raises(ChainAnalyzerError):
        ChainAnalyzerClient()


def test_tool_names_and_batch_is_opt_in():
    c = ChainAnalyzerClient(api_key="tfk_test")
    names = [t.name for t in get_chainanalyzer_tools(c)]
    assert names == [
        "chainanalyzer_sanctions_check",
        "chainanalyzer_hack_exposure",
        "chainanalyzer_freeze_status",
        "chainanalyzer_risk_score",
    ]
    with_batch = [t.name for t in ChainAnalyzerToolkit(client=c, include_batch=True).get_tools()]
    assert with_batch[-1] == "chainanalyzer_hack_exposure_batch"


async def test_hack_exposure_keeps_base58_case_and_wraps_disclaimer():
    seen = {}

    def handler(req: httpx.Request) -> httpx.Response:
        seen["path"] = req.url.path
        seen["key"] = req.headers.get("x-api-key")
        return httpx.Response(200, json={"address": TRON, "matched": True, "verdict": "attacker"})

    tool = get_chainanalyzer_tools(_client(handler))[1]
    out = json.loads(await tool.ainvoke({"address": TRON}))
    assert seen["path"] == f"/x402/api/address/{TRON}/hack-exposure"
    assert seen["key"] == "tfk_test"
    assert out["result"]["verdict"] == "attacker" and "not a legal determination" in out["disclaimer"]


async def test_batch_posts_json_body():
    seen = {}

    def handler(req: httpx.Request) -> httpx.Response:
        seen["method"] = req.method
        seen["body"] = json.loads(req.content)
        return httpx.Response(200, json={"results": [], "summary": {"requested": 2}})

    tool = get_chainanalyzer_tools(_client(handler), include_batch=True)[-1]
    await tool.ainvoke({"addresses": ["0x1", "0x2"], "chain": "ethereum"})
    assert seen == {"method": "POST", "body": {"addresses": ["0x1", "0x2"], "chain": "ethereum"}}


async def test_errors_are_returned_not_raised():
    tool = get_chainanalyzer_tools(_client(lambda req: httpx.Response(500, text="boom")))[0]
    out = json.loads(await tool.ainvoke({"address": "0xabc"}))
    assert "HTTP 500" in out["error"]
