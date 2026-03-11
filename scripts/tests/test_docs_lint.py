import importlib.util
import tempfile
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

    def test_ignores_inline_label_in_instructional_prose(self) -> None:
        self.assertFalse(
            DOCS_LINT.has_placeholder("Instruction: treat TODO: as a literal token in examples")
        )

    def test_ignores_placeholders_inside_fenced_code_blocks(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            docs_dir = root / "docs"
            templates_dir = docs_dir / "templates"
            docs_dir.mkdir(parents=True, exist_ok=True)
            templates_dir.mkdir(parents=True, exist_ok=True)

            (root / "README.md").write_text("# temp\n", encoding="utf-8")
            (docs_dir / "example.md").write_text(
                "\n".join(
                    [
                        "# Example",
                        "```bash",
                        "# TODO: this is a sample snippet, not a real placeholder",
                        "echo done",
                        "```",
                    ]
                )
                + "\n",
                encoding="utf-8",
            )

            missing_links, placeholders, invalid_json = DOCS_LINT.validate_docs(root)
            self.assertEqual(missing_links, [])
            self.assertEqual(invalid_json, [])
            self.assertEqual(placeholders, [])

    def test_still_flags_real_todo_outside_code_fence(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            docs_dir = root / "docs"
            templates_dir = docs_dir / "templates"
            docs_dir.mkdir(parents=True, exist_ok=True)
            templates_dir.mkdir(parents=True, exist_ok=True)

            (root / "README.md").write_text("# temp\n", encoding="utf-8")
            (docs_dir / "real-placeholder.md").write_text(
                "\n".join(["# Example", "- TODO: replace with final runbook link"]) + "\n",
                encoding="utf-8",
            )

            _missing_links, placeholders, _invalid_json = DOCS_LINT.validate_docs(root)
            self.assertEqual(len(placeholders), 1)
            self.assertIn("TODO: replace with final runbook link", placeholders[0][2])


if __name__ == "__main__":
    unittest.main()
