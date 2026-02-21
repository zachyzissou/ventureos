import importlib.util
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).resolve().parents[1] / "docs-lint.py"
SPEC = importlib.util.spec_from_file_location("docs_lint", MODULE_PATH)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"Unable to load docs-lint module from {MODULE_PATH}")
DOCS_LINT = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(DOCS_LINT)


class DocsLintPlaceholderTests(unittest.TestCase):
    def test_allows_descriptive_todo_fixme_phrase(self) -> None:
        self.assertFalse(DOCS_LINT.has_placeholder("- TODO/FIXME comment detection"))

    def test_ignores_inline_code_tokens(self) -> None:
        self.assertFalse(DOCS_LINT.has_placeholder("Use `TODO` as an example token"))

    def test_detects_todo_directive(self) -> None:
        self.assertTrue(DOCS_LINT.has_placeholder("- TODO: replace with concrete example"))

    def test_detects_fixme_directive_without_colon(self) -> None:
        self.assertTrue(DOCS_LINT.has_placeholder("FIXME update this section"))

    def test_detects_html_comment_placeholders(self) -> None:
        self.assertTrue(DOCS_LINT.has_placeholder("<!-- TODO remove before publishing -->"))

    def test_detects_question_mark_placeholders(self) -> None:
        self.assertTrue(DOCS_LINT.has_placeholder("status: ???"))


if __name__ == "__main__":
    unittest.main()
