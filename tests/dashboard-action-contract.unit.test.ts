import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import ts from "typescript";
import { COMMAND_NAVIGATION } from "@/domain/navigation/command-navigation";

/** Structural audit only: an existing route/handler is not proof of successful E2E operation. */
const appRoot = resolve(process.cwd(), "src/app");
const dashboardRoot = join(appRoot, "dashboard");
const apiRoot = join(appRoot, "api");

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}
function routeOf(file: string) {
  return "/" + relative(appRoot, file).split(sep).slice(0, -1)
    .filter(segment => !segment.startsWith("("))
    .join("/");
}
function reachable(href: string, routes: readonly string[]): boolean {
  const target = href.split(/[?#]/)[0].replace(/\/$/, "") || "/";
  return routes.some(route => {
    const segments = route.split("/");
    const pattern = segments.map(segment =>
      segment.startsWith("[") && segment.endsWith("]")
        ? "[^/]+" : segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    ).join("/");
    return new RegExp("^" + pattern + "$").test(target);
  });
}
function jsxAttribute(node: ts.JsxOpeningLikeElement, key: string): ts.JsxAttribute | undefined {
  return node.attributes.properties.find(
    (p): p is ts.JsxAttribute => ts.isJsxAttribute(p) && p.name.text === key,
  );
}
function staticAttribute(node: ts.JsxOpeningLikeElement, key: string): string | null {
  const value = jsxAttribute(node, key)?.initializer;
  return value && ts.isStringLiteral(value) ? value.text : null;
}
const dashboardFiles = walk(dashboardRoot).filter(path => path.endsWith(".tsx"));
const dashboardRoutes = walk(dashboardRoot).filter(path => path.endsWith("page.tsx")).map(routeOf);
const apiRoutes = walk(apiRoot).filter(path => path.endsWith("route.ts")).map(routeOf);

describe("Dashboard action and route contract audit", () => {
  it("ensures static internal navigation targets exist, including sidebar entries", () => {
    const bad: string[] = [];
    for (const path of dashboardFiles) {
      const source = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      function visit(node: ts.Node) {
        if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
          const tag = node.tagName.getText(source);
          if (tag === "Link" || tag === "a") {
            const href = staticAttribute(node, "href");
            if (href?.startsWith("/dashboard") && !reachable(href, dashboardRoutes)) {
              bad.push(`${relative(appRoot, path)}: ${href}`);
            }
          }
        }
        ts.forEachChild(node, visit);
      }
      visit(source);
    }
    for (const item of COMMAND_NAVIGATION) {
      if (!reachable(item.href, dashboardRoutes)) bad.push(`sidebar: ${item.href}`);
    }
    expect(bad).toEqual([]);
  });

  it("does not render a type=button control without an action", () => {
    const unbound: string[] = [];
    for (const path of dashboardFiles) {
      const source = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      function visit(node: ts.Node) {
        if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
            node.tagName.getText(source) === "button" &&
            staticAttribute(node, "type") === "button" &&
            !jsxAttribute(node, "onClick") && !jsxAttribute(node, "formAction")) {
          const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
          unbound.push(`${relative(appRoot, path)}:${line}`);
        }
        ts.forEachChild(node, visit);
      }
      visit(source);
    }
    expect(unbound).toEqual([]);
  });

  it("does not fetch a static API path without a real route handler", () => {
    const missing: string[] = [];
    for (const path of dashboardFiles) {
      const source = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      function visit(node: ts.Node) {
        if (ts.isCallExpression(node) && node.expression.getText(source) === "fetch" &&
            node.arguments.length && ts.isStringLiteral(node.arguments[0])) {
          const url = node.arguments[0].text;
          if (url.startsWith("/api/") && !reachable(url, apiRoutes)) {
            missing.push(`${relative(appRoot, path)}: ${url}`);
          }
        }
        ts.forEachChild(node, visit);
      }
      visit(source);
    }
    expect(missing).toEqual([]);
  });
});
