"use client";

import { useEffect, useRef } from "react";
import type * as MonacoNS from "monaco-editor";
import {
  CUSTOM_CSS_SELECTORS,
  CUSTOM_CSS_VARIABLES,
  type CssDiagnostic,
} from "@/lib/custom-css";

/**
 * Dynamically imported Monaco CSS editor (V2.5, NUL-6).
 *
 * Loaded exclusively via `next/dynamic(..., { ssr: false })` inside `CssPanel`
 * so users who never open the Pro CSS tab download zero bytes of Monaco.
 */
export default function MonacoCssEditor({
  value,
  onChange,
  diagnostics,
  revealLine,
}: {
  value: string;
  onChange: (next: string) => void;
  diagnostics: CssDiagnostic[];
  revealLine: number | null;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<MonacoNS.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof MonacoNS | null>(null);
  const onChangeRef = useRef(onChange);
  const initialValueRef = useRef(value);
  onChangeRef.current = onChange;

  useEffect(() => {
    let disposed = false;
    let completionDisposable: MonacoNS.IDisposable | null = null;

    async function mount() {
      if (!containerRef.current) return;

      // Provide a lightweight no-op worker factory so Monaco runs cleanly under strict CSP
      // without attempting third-party CDN script loads; diagnostics come from `compileCustomCss`.
      const win = window as Window & {
        MonacoEnvironment?: { getWorker: () => Worker };
      };
      if (!win.MonacoEnvironment) {
        win.MonacoEnvironment = {
          getWorker() {
            const blob = new Blob(["self.onmessage = function() {};"], {
              type: "application/javascript",
            });
            return new Worker(URL.createObjectURL(blob));
          },
        };
      }

      const monaco = await import("monaco-editor");
      if (disposed || !containerRef.current) return;
      monacoRef.current = monaco;

      monaco.editor.defineTheme("null-dark", {
        base: "vs-dark",
        inherit: true,
        rules: [
          { token: "attribute.name.css", foreground: "93c5fd" },
          { token: "attribute.value.css", foreground: "6ee7b7" },
          { token: "tag.css", foreground: "f9a8d4" },
          { token: "keyword.css", foreground: "c4b5fd" },
        ],
        colors: {
          "editor.background": "#0c0d11",
          "editor.lineHighlightBackground": "#ffffff08",
          "editorLineNumber.foreground": "#525866",
          "editorCursor.foreground": "#3fcf9f",
        },
      });

      completionDisposable = monaco.languages.registerCompletionItemProvider("css", {
        provideCompletionItems(model, position) {
          const word = model.getWordUntilPosition(position);
          const range = {
            startLineNumber: position.lineNumber,
            endLineNumber: position.lineNumber,
            startColumn: word.startColumn,
            endColumn: word.endColumn,
          };
          return {
            suggestions: [
              ...CUSTOM_CSS_SELECTORS.map((item) => ({
                label: item.selector,
                kind: monaco.languages.CompletionItemKind.Class,
                detail: item.description,
                insertText: `${item.selector} {\n  $0\n}`,
                insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                range,
              })),
              ...CUSTOM_CSS_VARIABLES.map((v) => ({
                label: `var(${v})`,
                kind: monaco.languages.CompletionItemKind.Variable,
                detail: "null profile token",
                insertText: `var(${v})`,
                range,
              })),
            ],
          };
        },
      });

      const editor = monaco.editor.create(containerRef.current, {
        value: initialValueRef.current,
        language: "css",
        theme: "null-dark",
        automaticLayout: true,
        minimap: { enabled: false },
        fontSize: 12,
        lineHeight: 19,
        tabSize: 2,
        scrollBeyondLastLine: false,
        wordWrap: "on",
        padding: { top: 10, bottom: 10 },
        glyphMargin: false,
        folding: true,
        renderLineHighlight: "line",
        ariaLabel: "Custom profile CSS editor",
      });

      editor.onDidChangeModelContent(() => {
        onChangeRef.current(editor.getValue());
      });

      editorRef.current = editor;
    }

    void mount();

    return () => {
      disposed = true;
      completionDisposable?.dispose();
      editorRef.current?.dispose();
      editorRef.current = null;
    };
  }, []);

  // Sync external updates (snippet insert, revision restore).
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    if (editor.getValue() !== value) {
      editor.setValue(value);
    }
  }, [value]);

  // Push live safety & syntax diagnostics into Monaco markers.
  useEffect(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    const model = editor?.getModel();
    if (!monaco || !model) return;

    monaco.editor.setModelMarkers(
      model,
      "null-css-validator",
      diagnostics.map((d) => ({
        startLineNumber: d.line,
        startColumn: d.column,
        endLineNumber: d.endLine,
        endColumn: d.endColumn,
        message: d.message,
        severity:
          d.severity === "error" ? monaco.MarkerSeverity.Error : monaco.MarkerSeverity.Warning,
      })),
    );
  }, [diagnostics, value]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !revealLine) return;
    editor.revealLineInCenter(revealLine);
    editor.setPosition({ lineNumber: revealLine, column: 1 });
    editor.focus();
  }, [revealLine]);

  return (
    <div
      ref={containerRef}
      className="h-[300px] w-full overflow-hidden rounded-xl border border-ink-200 bg-[#0c0d11] dark:border-white/10"
    />
  );
}
