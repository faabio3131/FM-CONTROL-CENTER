import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (file: string) => readFileSync(resolve(process.cwd(), file), "utf8");

describe("FM Command — approved logo-free dashboard home", () => {
  const home = read("src/app/dashboard/page.tsx");
  const core = read("src/app/dashboard/core-query-form.tsx");
  const css = read("src/app/globals.css");

  it("enables the clean hero only on the dashboard homepage", () => {
    expect(home).toContain("<CoreQueryForm homePresentation />");
    expect(core).toContain("homePresentation = false");
    expect(core).toContain("core-panel core-panel-home-clean");
    expect(core).toContain("{!homePresentation ? (");
    expect(core).toContain('className="command-approved-artwork core-approved-artwork"');
    expect(core).toContain("APPROVED_COMMAND_ARTWORK_SRC");
    expect(home).not.toContain("APPROVED_COMMAND_ARTWORK_SRC");
  });

  it("keeps cognitive query, voice and authority controls intact", () => {
    expect(core).toContain('onSubmit={submit}');
    expect(core).toContain('fetch("/api/core/query", requestInit)');
    expect(core).toContain("toggleVoice");
    expect(core).toContain("Recomendação IA · análise, sem execução");
    expect(core).toContain("Autoridade Determinística · ações somente em fluxos autenticados");
  });

  it("renders an image-free, responsive dark hero with decorative CSS only", () => {
    expect(css).toContain(".core-panel-home-clean::before");
    expect(css).toContain(".core-panel-home-clean::after");
    expect(css).toContain("background:repeating-radial-gradient(");
    expect(css).toContain("-webkit-text-fill-color:#f8fafc");
    expect(css).toContain(".core-panel-home-clean .core-panel-head");
    expect(css).toContain("@media(max-width:680px)");
    expect(css).not.toContain(".core-panel-home-clean img{display:none}");
  });
});
