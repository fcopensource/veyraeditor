"""dxray: an X-ray for your data.

    import dxray as dx

    report = dx.scan(df, target="revenue")   # what each column is, what's wrong, what stands out
    report                                    # a rich report in Jupyter; print(report) in a terminal
    report.to_html("report.html")             # a shareable page with charts

    clean_df, log = dx.clean(df)              # fix the safe problems, see every change
    prompt = dx.for_llm(df)                   # the dataset described for an AI model
    dx.ask(df, "Why did sales drop in March?")  # answered by Claude (pip install "dxray[ai]")
"""

from ._api import CleanLog, clean, for_llm, scan
from ._ask import Answer, AskError, ask
from ._infer import infer
from ._model import Column, Insight, Issue
from ._report import Report

__version__ = "1.0.0"
__all__ = ["Answer", "AskError", "CleanLog", "Column", "Insight", "Issue", "Report", "__version__", "ask", "clean", "for_llm", "infer", "scan"]
