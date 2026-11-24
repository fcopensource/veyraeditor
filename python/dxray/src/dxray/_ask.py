"""dx.ask(): questions about your data, answered by Claude from dxray's description of it.

Needs the optional extra: ``pip install "dxray[ai]"``, and an Anthropic API key in ANTHROPIC_API_KEY (or an
``ant auth login`` profile). Claude sees dx.for_llm()'s summary (schema, statistics, a few sample rows, problems and
findings), not your whole dataset.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from ._api import _frame, for_llm, scan

DEFAULT_MODEL = "claude-opus-5-5"

SYSTEM = (
    "You are a careful data analyst. The user's dataset is described below by dxray: its columns, statistics computed "
    "from every row, a few sample rows, data problems and findings. Answer the user's question from this description. "
    "Be concrete and cite the numbers you use. If the description doesn't contain enough to answer, say what is "
    "missing and give the pandas code that would compute it. Keep answers short unless asked for more.\n\n"
)


class AskError(RuntimeError):
    """Asking Claude didn't work: missing package or key, a refusal, or an API error. The message says what to do."""


@dataclass
class Answer:
    text: str
    model: str
    input_tokens: int = 0
    output_tokens: int = 0
    cached_tokens: int = 0

    def __str__(self) -> str:
        return self.text

    def _repr_markdown_(self) -> str:
        return self.text


def ask(data: Any, question: str, *, target: str | None = None, model: str = DEFAULT_MODEL, effort: str = "medium",
        client: Any = None, max_tokens: int = 16000) -> Answer:
    """Ask a question about a dataset in plain English and get an answer from Claude.

    >>> dx.ask(df, "Which region is growing fastest, and is anything odd about the data?")

    ``effort`` ("low", "medium", "high") trades depth for speed and cost. Pass ``client`` to reuse your own
    ``anthropic.Anthropic()`` client. Asking several questions about the same data reuses the cached description.
    """
    if not question or not question.strip():
        raise ValueError("Ask a question, like dx.ask(df, 'What drives revenue?')")
    try:
        import anthropic
    except ImportError:
        raise AskError('dx.ask() needs the Anthropic SDK. Install it with:  pip install "dxray[ai]"') from None
    df, name = _frame(data)
    context = for_llm(df, target=target, report=scan(df, target, name=name))
    try:
        client = client or anthropic.Anthropic()
        # Streaming keeps long answers clear of request timeouts. The description sits in a cached system prompt, so a
        # second question about the same data is faster and cheaper. If Claude declines, "default" fallbacks retry the
        # request on the model Anthropic recommends.
        with client.beta.messages.stream(
            model=model,
            max_tokens=max_tokens,
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
            output_config={"effort": effort},
            system=[{"type": "text", "text": SYSTEM + context, "cache_control": {"type": "ephemeral"}}],
            messages=[{"role": "user", "content": question}],
        ) as stream:
            message = stream.get_final_message()
    except anthropic.AuthenticationError:
        raise AskError("Anthropic rejected the API key. Set ANTHROPIC_API_KEY (from console.anthropic.com) or run `ant auth login`.") from None
    except anthropic.RateLimitError:
        raise AskError("Anthropic's rate limit was reached. Wait a moment and ask again.") from None
    except anthropic.APIStatusError as e:
        raise AskError(f"The Anthropic API returned an error ({e.status_code}): {e.message}") from None
    except anthropic.APIConnectionError:
        raise AskError("Couldn't reach the Anthropic API. Check your internet connection.") from None
    except anthropic.AnthropicError as e:
        if isinstance(e, getattr(anthropic, "CredentialsError", ())) or "api_key" in str(e).lower() or "credentials" in str(e).lower():
            raise AskError("No Anthropic API key found. Set ANTHROPIC_API_KEY (from console.anthropic.com) or run `ant auth login`.") from None
        raise AskError(str(e)) from None
    if message.stop_reason == "refusal":
        raise AskError("Claude declined to answer this question.")
    text = "".join(b.text for b in message.content if getattr(b, "type", "") == "text").strip()
    usage = getattr(message, "usage", None)
    return Answer(text=text, model=getattr(message, "model", model),
                  input_tokens=getattr(usage, "input_tokens", 0) or 0, output_tokens=getattr(usage, "output_tokens", 0) or 0,
                  cached_tokens=getattr(usage, "cache_read_input_tokens", 0) or 0)
